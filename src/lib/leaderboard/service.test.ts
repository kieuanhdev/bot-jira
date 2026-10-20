import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  issueFindMany: vi.fn(),
  listActiveProjects: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findMany: mocks.userFindMany,
    },
    issueCache: { findMany: mocks.issueFindMany },
  },
}));

vi.mock("@/lib/jira/project-catalog", () => ({
  listActiveProjects: mocks.listActiveProjects,
}));

import { getLeaderboardData } from "./service";

describe("getLeaderboardData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      jiraUsername: "alice",
      jiraUserEnc: null,
    });
    mocks.userFindMany.mockResolvedValue([]);
    mocks.issueFindMany.mockResolvedValue([]);
    mocks.listActiveProjects.mockResolvedValue([
      { key: "EPM" },
      { key: "EPB" },
      { key: " cicm " },
    ]);
  });

  it("uses every active mobile project except EPB, independently of Board preferences", async () => {
    const result = await getLeaderboardData({
      currentUserId: "user-1",
      timeframe: "all",
    });

    expect(mocks.issueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          projectKey: { in: ["EPM", "CICM"] },
          points: { not: null },
        },
      })
    );
    expect(result.projects).toEqual(["EPM", "CICM"]);
    expect(result.project).toBeNull();
  });

  it("allows filtering to one mobile project but never to EPB", async () => {
    const selected = await getLeaderboardData({
      currentUserId: "user-1",
      timeframe: "all",
      project: "cicm",
    });

    expect(mocks.issueFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectKey: { in: ["CICM"] } }),
      })
    );
    expect(selected.project).toBe("CICM");

    const excluded = await getLeaderboardData({
      currentUserId: "user-1",
      timeframe: "all",
      project: "EPB",
    });

    expect(mocks.issueFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectKey: { in: ["EPM", "CICM"] } }),
      })
    );
    expect(excluded.project).toBeNull();
  });

  it("only queries and includes users who have logged in with a Jira token", async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: "u-1",
        displayName: "Alice",
        jiraUsername: "alice",
        jiraUserEnc: null,
        jiraTokenEnc: "enc-token-alice",
        email: "alice@example.com",
        role: "developer",
      },
      {
        id: "u-2",
        displayName: "No Token User",
        jiraUsername: "notoken",
        jiraUserEnc: null,
        jiraTokenEnc: "   ",
        email: "notoken@example.com",
        role: "developer",
      },
    ]);

    const result = await getLeaderboardData({
      currentUserId: "user-1",
      timeframe: "all",
    });

    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          jiraTokenEnc: { not: null },
        },
      })
    );
    expect(result.members.map((m) => m.jiraUsername)).toContain("alice");
    expect(result.members.map((m) => m.jiraUsername)).not.toContain("notoken");
  });
});
