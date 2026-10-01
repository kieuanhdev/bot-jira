import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncReleasesFromJira, JIRA_RELEASES_INTEGRATION } from "./sync";
import { JiraRequestError } from "@/lib/jira/client";

const mocks = vi.hoisted(() => ({
  findUniqueUser: vi.fn(),
  userJiraAuth: vi.fn(),
  getSystemJiraAuth: vi.fn(),
  jiraWith: vi.fn(),
  getVersions: vi.fn(),
  findFirstRelease: vi.fn(),
  createRelease: vi.fn(),
  updateRelease: vi.fn(),
  findManyIssues: vi.fn(),
  createManyReleaseTasks: vi.fn(),
  deleteManyReleaseTasks: vi.fn(),
  upsertCursor: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUniqueUser },
    release: {
      findFirst: mocks.findFirstRelease,
      create: mocks.createRelease,
      update: mocks.updateRelease,
    },
    issueCache: {
      findMany: mocks.findManyIssues,
    },
    releaseTask: {
      createMany: mocks.createManyReleaseTasks,
      deleteMany: mocks.deleteManyReleaseTasks,
    },
    integrationCursor: {
      upsert: mocks.upsertCursor,
    },
  },
}));

vi.mock("@/lib/jira/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/client")>();
  return {
    ...actual,
    getSystemJiraAuth: mocks.getSystemJiraAuth,
    jiraWith: mocks.jiraWith,
  };
});

vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
}));

vi.mock("@/lib/jira/project-catalog", () => ({
  listSyncEnabledProjectKeys: vi.fn().mockResolvedValue(["EIM"]),
  normalizeProjectKey: (k: string) => k.trim().toUpperCase(),
}));

describe("syncReleasesFromJira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userJiraAuth.mockReturnValue({ user: "u1", token: "tok", authMode: "Bearer" });
    mocks.getSystemJiraAuth.mockResolvedValue({ user: "system", token: "sys-tok", authMode: "Bearer" });
    mocks.findUniqueUser.mockResolvedValue({
      jiraUserEnc: "enc",
      jiraTokenEnc: "enc",
      jiraAuth: "PAT",
    });
    mocks.jiraWith.mockReturnValue({
      getVersions: mocks.getVersions,
    });
    mocks.findFirstRelease.mockResolvedValue(null);
    mocks.createRelease.mockImplementation(async ({ data }: any) => ({ id: `rel-${data.version}`, ...data }));
    mocks.updateRelease.mockImplementation(async ({ data }: any) => ({ id: "rel-upd", ...data }));
    mocks.findManyIssues.mockResolvedValue([]);
    mocks.upsertCursor.mockResolvedValue({});
  });

  it("handles missing auth and sets auth_required on cursor and result", async () => {
    mocks.userJiraAuth.mockReturnValue(null);
    mocks.getSystemJiraAuth.mockResolvedValue(null);

    const result = await syncReleasesFromJira({ projectKeys: ["EIM"] });

    expect(result.syncedProjects).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.projects[0].state).toBe("auth_required");
    expect(result.projects[0].errorCode).toBe("jira_credentials_required");
    expect(mocks.upsertCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integration_scope: {
            integration: JIRA_RELEASES_INTEGRATION,
            scope: "EIM",
          },
        },
        create: expect.objectContaining({
          stats: expect.objectContaining({ state: "auth_required" }),
        }),
      })
    );
  });

  it("handles empty Fix Versions array without error, records empty state and cursor", async () => {
    mocks.getVersions.mockResolvedValue([]);

    const result = await syncReleasesFromJira({ projectKeys: ["EIM"] });

    expect(result.errors).toHaveLength(0);
    expect(result.syncedProjects).toEqual(["EIM"]);
    expect(result.totalReleases).toBe(0);
    expect(result.projects[0].state).toBe("empty");
    expect(mocks.upsertCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integration_scope: {
            integration: JIRA_RELEASES_INTEGRATION,
            scope: "EIM",
          },
        },
        create: expect.objectContaining({
          stats: expect.objectContaining({ state: "empty", versionCount: 0 }),
        }),
      })
    );
  });

  it("syncs Fix Versions and links matching issues", async () => {
    mocks.getVersions.mockResolvedValue([
      { id: "v101", name: "v1.0", released: false, archived: false },
    ]);
    mocks.findManyIssues.mockResolvedValue([
      { jiraKey: "EIM-1" },
      { jiraKey: "EIM-2" },
    ]);

    const result = await syncReleasesFromJira({ projectKeys: ["EIM"] });

    expect(result.errors).toHaveLength(0);
    expect(result.totalReleases).toBe(1);
    expect(result.tasksLinked).toBe(2);
    expect(result.projects[0].state).toBe("synced");
    expect(mocks.createManyReleaseTasks).toHaveBeenCalledWith({
      data: [{ releaseId: "rel-v1.0", jiraKey: "EIM-1" }, { releaseId: "rel-v1.0", jiraKey: "EIM-2" }],
      skipDuplicates: true,
    });
  });

  it("catches 403 Forbidden and records forbidden state on cursor", async () => {
    mocks.getVersions.mockRejectedValue(new JiraRequestError("Forbidden", 403, false));

    const result = await syncReleasesFromJira({ projectKeys: ["EIM"] });

    expect(result.errors).toHaveLength(1);
    expect(result.projects[0].state).toBe("forbidden");
    expect(result.projects[0].errorCode).toBe("jira_forbidden");
    expect(mocks.upsertCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integration_scope: {
            integration: JIRA_RELEASES_INTEGRATION,
            scope: "EIM",
          },
        },
        create: expect.objectContaining({
          stats: expect.objectContaining({ state: "forbidden", errorCode: "jira_forbidden" }),
        }),
      })
    );
  });

  it("catches 500 error and records failed state on cursor without crashing other projects", async () => {
    mocks.getVersions.mockRejectedValue(new JiraRequestError("Jira server error", 500, false));

    const result = await syncReleasesFromJira({ projectKeys: ["EIM"] });

    expect(result.errors).toHaveLength(1);
    expect(result.projects[0].state).toBe("failed");
    expect(result.projects[0].errorCode).toBe("jira_unavailable");
  });
});
