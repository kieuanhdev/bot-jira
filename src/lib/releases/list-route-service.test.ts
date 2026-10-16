import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  releaseFindMany: vi.fn(),
  integrationCursorFindUnique: vi.fn(),
  branchRows: vi.fn(),
  scopedProjects: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    release: { findMany: mocks.releaseFindMany },
    integrationCursor: { findUnique: mocks.integrationCursorFindUnique },
  },
}));

vi.mock("@/lib/bitbucket/branch-links", () => ({
  loadConfirmedBranchRows: mocks.branchRows,
}));

vi.mock("@/lib/project-scope", () => ({
  getUserScopedProjects: mocks.scopedProjects,
}));

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    bitbucketBaseBranch: "main",
  },
}));

import { listReleasesForUser, ReleaseForbiddenError } from "./list-route-service";

describe("listReleasesForUser", () => {
  const session = { user: { id: "u1", role: "release_manager" } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scopedProjects.mockResolvedValue(["EPM", "MHRM"]);
    mocks.branchRows.mockResolvedValue([]);
    mocks.integrationCursorFindUnique.mockResolvedValue(null);
  });

  it("throws ReleaseForbiddenError when requested project is not in user scope", async () => {
    await expect(
      listReleasesForUser(session, { projectKey: "SECRET" })
    ).rejects.toThrow(ReleaseForbiddenError);
  });

  it("returns serialized releases with Date fields converted to ISO strings", async () => {
    const fixedDate = new Date("2026-10-15T10:00:00.000Z");
    mocks.releaseFindMany.mockResolvedValue([
      {
        id: "rel-1",
        version: "v1.0.0",
        targetLabel: "rc-1",
        projectKey: "EPM",
        jiraVersionId: "jv-1",
        description: "Test release",
        releaseDate: fixedDate,
        createdById: "u1",
        releasedAt: null,
        status: "in_progress",
        archived: false,
        jiraUpdatedAt: fixedDate,
        lastSyncedAt: fixedDate,
        notes: null,
        createdAt: fixedDate,
        updatedAt: fixedDate,
        tasks: [
          {
            jiraKey: "EPM-10",
            issue: {
              jiraKey: "EPM-10",
              status: "In Progress",
              statusCategory: "indeterminate",
              summary: "A task",
              points: 3,
              priority: "High",
              labels: [],
              assigneeJira: "alice",
              deletedAt: null,
            },
          },
        ],
      },
    ]);

    const res = await listReleasesForUser(session, { projectKey: "EPM" });

    expect(res.summary).toBeDefined();
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe("rel-1");
    // Date fields are serialized as strings
    expect(typeof res.items[0].createdAt).toBe("string");
    expect(res.items[0].createdAt).toBe(fixedDate.toISOString());
    expect(typeof res.items[0].releaseDate).toBe("string");
    expect(res.jiraBaseUrl).toBe("https://jira.example.com");
    expect(res.sync.state).toBe("synced");
  });

  it("filters archived releases when includeArchived is false", async () => {
    mocks.releaseFindMany.mockResolvedValue([
      {
        id: "rel-active",
        version: "v1.0.0",
        projectKey: "EPM",
        status: "in_progress",
        archived: false,
        tasks: [],
      },
      {
        id: "rel-archived",
        version: "v0.9.0",
        projectKey: "EPM",
        status: "released",
        archived: true,
        tasks: [],
      },
    ]);

    const activeOnly = await listReleasesForUser(session, { includeArchived: false });
    expect(activeOnly.items.map((i: { id: string }) => i.id)).toEqual(["rel-active"]);

    const withArchived = await listReleasesForUser(session, { includeArchived: true });
    expect(withArchived.items.map((i: { id: string }) => i.id)).toEqual(["rel-active", "rel-archived"]);
  });
});
