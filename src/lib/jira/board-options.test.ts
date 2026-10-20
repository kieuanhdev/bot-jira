import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userBoardPreference: { findUnique, deleteMany: vi.fn(async () => ({ count: 0 })) },
  },
}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  projectBoardIds: {},
}));

import { JiraRequestError } from "./client";
import { clearBoardOptionsCache, getBoardOptions } from "./board-options";

const FRESH_MS = 5 * 60_000;
const STALE_MS = 30 * 60_000;

function makeClient(impl?: () => Promise<{ id: number; name: string; type: string }[]>) {
  const getBoardsForProject = vi.fn(
    impl ?? (async () => [{ id: 7, name: "Board", type: "kanban" }])
  );
  return { getBoardsForProject };
}

describe("getBoardOptions cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    clearBoardOptionsCache();
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it("returns cached data while fresh", async () => {
    const client = makeClient();
    const first = await getBoardOptions(client, "u1", "abc");
    const second = await getBoardOptions(client, "u1", "ABC");

    expect(second).toBe(first);
    expect(client.getBoardsForProject).toHaveBeenCalledTimes(1);
  });

  it("serves stale data and refreshes once in the background", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    const client = makeClient();
    const first = await getBoardOptions(client, "u1", "ABC");

    vi.setSystemTime(Date.now() + FRESH_MS + 1_000);
    const [a, b] = await Promise.all([
      getBoardOptions(client, "u1", "ABC"),
      getBoardOptions(client, "u1", "ABC"),
    ]);

    expect(a).toBe(first);
    expect(b).toBe(first);
    expect(client.getBoardsForProject).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(client.getBoardsForProject).toHaveBeenCalledTimes(2));
  });

  it("refetches once the stale window has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    const client = makeClient();
    await getBoardOptions(client, "u1", "ABC");

    vi.setSystemTime(Date.now() + STALE_MS + 1_000);
    await getBoardOptions(client, "u1", "ABC");

    expect(client.getBoardsForProject).toHaveBeenCalledTimes(2);
  });

  it("drops the entry when a background refresh gets 403", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    const client = makeClient();
    await getBoardOptions(client, "u1", "ABC");

    client.getBoardsForProject.mockRejectedValueOnce(new JiraRequestError("forbidden", 403, false));
    vi.setSystemTime(Date.now() + FRESH_MS + 1_000);
    await getBoardOptions(client, "u1", "ABC");
    await vi.waitFor(async () => {
      await getBoardOptions(client, "u1", "ABC");
      expect(client.getBoardsForProject).toHaveBeenCalledTimes(3);
    });
  });

  it("clearBoardOptionsCache(user, project) clears only that key", async () => {
    const client = makeClient();
    await getBoardOptions(client, "u1", "ABC");
    await getBoardOptions(client, "u1", "XYZ");
    expect(client.getBoardsForProject).toHaveBeenCalledTimes(2);

    clearBoardOptionsCache("u1", "abc");
    await getBoardOptions(client, "u1", "XYZ");
    expect(client.getBoardsForProject).toHaveBeenCalledTimes(2);
    await getBoardOptions(client, "u1", "ABC");
    expect(client.getBoardsForProject).toHaveBeenCalledTimes(3);
  });
});
