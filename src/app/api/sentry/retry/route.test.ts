import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sentryIssueImported: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/sentry/retry", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/sentry/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without auth", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await post({ id: "r1" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u-1", role: "member" } });
    const res = await post({ id: "r1" });
    expect(res.status).toBe(403);
  });

  it("returns 400 if id is missing", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "a-1", role: "admin" } });
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("returns 404 if row does not exist", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "a-1", role: "admin" } });
    mocks.findUnique.mockResolvedValueOnce(null);
    const res = await post({ id: "r1" });
    expect(res.status).toBe(404);
  });

  it("resets attemptCount, lastError, and marks state approved for admin", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "a-1", role: "admin" } });
    mocks.findUnique.mockResolvedValueOnce({ id: "r1", state: "failed" });
    mocks.update.mockResolvedValueOnce({ id: "r1", state: "approved" });

    const res = await post({ id: "r1" });
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { state: "approved", attemptCount: 0, lastError: null, lastAttemptAt: null },
    });
  });
});
