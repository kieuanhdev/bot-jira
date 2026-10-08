import { upsertBranchLink } from "@/lib/bitbucket/branch-links";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractRepoSlugFromUrl,
  parsePrId,
  syncJiraDevStatusForIssue,
} from "./dev-status";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueCache: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    branchInfo: {
      upsert: vi.fn().mockResolvedValue({ id: "branch-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/lib/bitbucket/branch-links", () => ({
  upsertBranchLink: vi.fn().mockResolvedValue({ changed: true }),
  recomputePrimaryLink: vi.fn().mockResolvedValue("CICM-712"),
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    getCommitBranches: vi.fn().mockResolvedValue(["feature/custom-login-branch"]),
  },
}));

vi.mock("./client", () => ({
  getSystemJiraAuth: vi.fn().mockResolvedValue({
    user: "test-user",
    token: "test-token",
    authMode: "Bearer",
  }),
  jiraWith: vi.fn().mockReturnValue({
    getIssue: vi.fn().mockResolvedValue({ id: "208269", key: "CICM-712" }),
  }),
  JiraRequestError: class extends Error {},
}));

describe("extractRepoSlugFromUrl", () => {
  it("extracts project and repo from Bitbucket Server PR URLs", () => {
    expect(
      extractRepoSlugFromUrl(
        "https://git-sds.softdreams.vn:7990/projects/CICB/repos/mobile-cic-2021/pull-requests/727"
      )
    ).toBe("CICB/mobile-cic-2021");
  });

  it("extracts project and repo from Bitbucket Server browse URLs", () => {
    expect(
      extractRepoSlugFromUrl(
        "https://git-sds.softdreams.vn:7990/projects/EPM/repos/easy_pos/browse"
      )
    ).toBe("EPM/easy_pos");
  });

  it("extracts from SCM URLs", () => {
    expect(
      extractRepoSlugFromUrl(
        "https://git-sds.softdreams.vn:7990/scm/cicb/mobile-cic-2021.git"
      )
    ).toBe("CICB/mobile-cic-2021");
  });

  it("returns null for invalid or empty URLs", () => {
    expect(extractRepoSlugFromUrl("")).toBeNull();
    expect(extractRepoSlugFromUrl(null)).toBeNull();
    expect(extractRepoSlugFromUrl("https://example.com/other/path")).toBeNull();
  });
});

describe("parsePrId", () => {
  it("parses numeric PR IDs with hash prefixes", () => {
    expect(parsePrId("#727")).toBe(727);
    expect(parsePrId("1234")).toBe(1234);
    expect(parsePrId("#1")).toBe(1);
  });

  it("handles null or non-numeric values", () => {
    expect(parsePrId(null)).toBeNull();
    expect(parsePrId("")).toBeNull();
    expect(parsePrId("none")).toBeNull();
  });
});

describe("syncJiraDevStatusForIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches PR and branch detail from Jira and upserts into BranchInfo", async () => {
    const mockDetail = {
      errors: [],
      detail: [
        {
          branches: [],
          pullRequests: [
            {
              id: "#727",
              name: "CICM-712 [CICM Refactor Base]",
              url: "https://git-sds.softdreams.vn:7990/projects/CICB/repos/mobile-cic-2021/pull-requests/727",
              status: "MERGED",
              source: { branch: "refactor/CICM-712_refactor_base_v2" },
              destination: { branch: "dev" },
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    });

    const result = await syncJiraDevStatusForIssue("CICM-712");

    expect(result.ok).toBe(true);
    expect(result.syncedBranches).toHaveLength(1);
    expect(result.syncedBranches[0]).toMatchObject({
      repo: "CICB/mobile-cic-2021",
      branch: "refactor/CICM-712_refactor_base_v2",
      prId: 727,
      prState: "MERGED",
      merged: true,
      prDestinationBranch: "dev",
    });

    expect(prisma.branchInfo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repo_branch: {
            repo: "CICB/mobile-cic-2021",
            branch: "refactor/CICM-712_refactor_base_v2",
          },
        },
        create: expect.objectContaining({
          jiraKey: "CICM-712",
          linkSource: "jira_dev_status",
          linkState: "confirmed",
          merged: true,
        }),
      })
    );
    expect(upsertBranchLink).toHaveBeenCalledWith("branch-1", "CICM-712", {
      source: "jira_dev_status",
      confidence: 100,
    });
  });

  it("links branches discovered from commits via Bitbucket", async () => {
    const mockDetail = {
      errors: [],
      detail: [
        {
          branches: [],
          pullRequests: [],
          repositories: [
            {
              name: "mobile-cic-2021",
              url: "https://git-sds.softdreams.vn:7990/projects/CICB/repos/mobile-cic-2021/browse",
              commits: [
                {
                  id: "commit123456",
                  message: "[CICM-712] Fix login button layout",
                },
              ],
            },
          ],
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetail),
    });

    const result = await syncJiraDevStatusForIssue("CICM-712");

    expect(result.ok).toBe(true);
    expect(result.syncedBranches).toContainEqual(
      expect.objectContaining({
        repo: "CICB/mobile-cic-2021",
        branch: "feature/custom-login-branch",
        merged: false,
      })
    );

    expect(prisma.branchInfo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repo_branch: {
            repo: "CICB/mobile-cic-2021",
            branch: "feature/custom-login-branch",
          },
        },
        create: expect.objectContaining({
          jiraKey: "CICM-712",
          linkSource: "commit_message",
          linkState: "confirmed",
        }),
      })
    );
  });
});
