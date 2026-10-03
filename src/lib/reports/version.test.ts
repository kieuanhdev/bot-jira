import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveProjectVersionFilter } from "./version";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    release: {
      findFirst: vi.fn(),
    },
  },
}));

describe("resolveProjectVersionFilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when versionId is missing or 'all'", async () => {
    expect(await resolveProjectVersionFilter("PRJ", null)).toBeNull();
    expect(await resolveProjectVersionFilter("PRJ", undefined)).toBeNull();
    expect(await resolveProjectVersionFilter("PRJ", "all")).toBeNull();
  });

  it("resolves from release table with jiraVersionId and version name", async () => {
    vi.mocked(prisma.release.findFirst).mockResolvedValue({
      id: "rel-cuid-123",
      jiraVersionId: "10400",
      version: "v1.0.0",
      releaseDate: new Date("2026-10-20T00:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    } as unknown as Awaited<ReturnType<typeof prisma.release.findFirst>>);

    const res = await resolveProjectVersionFilter("PRJ", "rel-cuid-123");
    expect(res).not.toBeNull();
    expect(res?.versionId).toBe("10400");
    expect(res?.versionName).toBe("v1.0.0");
    expect(res?.whereInput).toEqual({
      OR: [
        { fixVersionIds: { has: "10400" } },
        { fixVersionNames: { has: "v1.0.0" } },
      ],
    });
  });

  it("falls back to direct matching if release is not found in release table", async () => {
    vi.mocked(prisma.release.findFirst).mockResolvedValue(null);

    const res = await resolveProjectVersionFilter("PRJ", "10400");
    expect(res).not.toBeNull();
    expect(res?.versionId).toBe("10400");
    expect(res?.whereInput).toEqual({
      OR: [
        { fixVersionIds: { has: "10400" } },
        { fixVersionNames: { has: "10400" } },
      ],
    });
  });
});
