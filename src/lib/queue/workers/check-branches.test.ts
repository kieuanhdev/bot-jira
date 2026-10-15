import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyIssues: vi.fn(),
  findManyBranchInfo: vi.fn(),
  findUniqueBranchInfo: vi.fn(),
  upsertBranchInfo: vi.fn(),
  updateManyBranchInfo: vi.fn(),
  upsertCursor: vi.fn(),
  getSystemBitbucketCreds: vi.fn(),
  allRepos: vi.fn(),
  branchStatus: vi.fn(),
  getCommit: vi.fn(),
  loadSyncPolicy: vi.fn(),
  upsertBranchLink: vi.fn(),
  recomputePrimaryLink: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueCache: {
      findMany: mocks.findManyIssues,
    },
    branchInfo: {
      findMany: mocks.findManyBranchInfo,
      findUnique: mocks.findUniqueBranchInfo,
      upsert: mocks.upsertBranchInfo,
      updateMany: mocks.updateManyBranchInfo,
    },
    integrationCursor: {
      upsert: mocks.upsertCursor,
    },
  },
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    allRepos: mocks.allRepos,
    branchStatus: mocks.branchStatus,
    getCommit: mocks.getCommit,
  },
  getSystemBitbucketCreds: mocks.getSystemBitbucketCreds,
  isBitbucketPermissionError: (err: unknown) =>
    err instanceof Error && (err.message.includes("401") || err.message.includes("403")),
}));

vi.mock("@/lib/jira/sync-features", () => ({
  loadSyncPolicy: mocks.loadSyncPolicy,
}));

vi.mock("@/lib/bitbucket/branch-links", () => ({
  upsertBranchLink: mocks.upsertBranchLink,
  recomputePrimaryLink: mocks.recomputePrimaryLink,
}));

import { runCheckBranches } from "./check-branches";

describe("runCheckBranches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemBitbucketCreds.mockResolvedValue({ user: "bb-sys", token: "tok" });
    mocks.loadSyncPolicy.mockResolvedValue({
      disabledKeys: () => [],
    });
    mocks.findManyIssues.mockResolvedValue([
      { jiraKey: "PROJ-1" },
      { jiraKey: "PROJ-2" },
    ]);
    mocks.findManyBranchInfo.mockResolvedValue([]);
    mocks.findUniqueBranchInfo.mockResolvedValue(null);
    mocks.upsertBranchInfo.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: "branch-row-1",
      ...create,
    }));
    mocks.updateManyBranchInfo.mockResolvedValue({ count: 1 });
    mocks.upsertCursor.mockResolvedValue({});
    mocks.upsertBranchLink.mockResolvedValue(undefined);
    mocks.recomputePrimaryLink.mockResolvedValue(undefined);
  });

  it("returns guard error when Bitbucket credentials are not configured", async () => {
    mocks.getSystemBitbucketCreds.mockResolvedValue(null);

    const res = await runCheckBranches();
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("Bitbucket not configured in env or user settings");
    expect(mocks.allRepos).not.toHaveBeenCalled();
  });

  it("syncs branches across multiple repositories and records cursor stats", async () => {
    mocks.allRepos.mockResolvedValue(["PROJ/repo-1", "PROJ/repo-2"]);
    mocks.branchStatus.mockImplementation(async (repo: string) => {
      if (repo === "PROJ/repo-1") {
        return [
          {
            branch: { name: "feature/PROJ-1-login", latestCommit: "sha-1", latestCommitDate: "2026-10-10" },
            merged: false,
          },
        ];
      }
      return [
        {
          branch: { name: "feature/PROJ-2-signup", latestCommit: "sha-2", latestCommitDate: "2026-10-10" },
          merged: true,
        },
      ];
    });

    const res = await runCheckBranches();

    expect(res.ok).toBe(true);
    expect(res.stats!.checked).toBe(2);
    expect(res.stats!.deleted).toBe(2); // 1 per repo from deleteResult.count
    expect(res.stats!.skippedUnauthorized).toBe(0);

    expect(mocks.branchStatus).toHaveBeenCalledWith("PROJ/repo-1");
    expect(mocks.branchStatus).toHaveBeenCalledWith("PROJ/repo-2");
    expect(mocks.upsertBranchInfo).toHaveBeenCalledTimes(2);

    expect(mocks.upsertCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integration_scope: { integration: "bitbucket", scope: "branches" },
        },
        update: expect.objectContaining({
          stats: expect.objectContaining({ checked: 2, deleted: 2 }),
        }),
      })
    );
  });

  it("skips unauthorized repo gracefully and continues other repos", async () => {
    mocks.allRepos.mockResolvedValue(["PROJ/repo-unauthorized", "PROJ/repo-ok"]);
    mocks.branchStatus.mockImplementation(async (repo: string) => {
      if (repo === "PROJ/repo-unauthorized") {
        throw new Error("Bitbucket branches -> 401: Unauthorized");
      }
      return [
        {
          branch: { name: "feature/PROJ-1-ok", latestCommit: "sha-3" },
          merged: false,
        },
      ];
    });

    const res = await runCheckBranches();

    expect(res.ok).toBe(true);
    expect(res.stats!.skippedUnauthorized).toBe(1);
    expect(res.stats!.checked).toBe(1);
  });

  it("records error when repo fails with unexpected error", async () => {
    mocks.allRepos.mockResolvedValue(["PROJ/repo-failing", "PROJ/repo-ok"]);
    mocks.branchStatus.mockImplementation(async (repo: string) => {
      if (repo === "PROJ/repo-failing") {
        throw new Error("Connection reset by peer");
      }
      return [];
    });

    const res = await runCheckBranches();

    expect(res.ok).toBe(false);
    expect(res.errors).toContain("PROJ/repo-failing: Connection reset by peer");
  });
});
