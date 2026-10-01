import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getIssues } from "@/app/api/issues/route";
import { GET as getProjects } from "@/app/api/projects/route";
import { GET as getReleases } from "@/app/api/releases/route";
import { POST as syncReleases } from "@/app/api/releases/sync/route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  findManyIssues: vi.fn(),
  countIssues: vi.fn(),
  groupByIssues: vi.fn(),
  findManyProjects: vi.fn(),
  findManyReleases: vi.fn(),
  findUniqueCursor: vi.fn(),
  findManyCursors: vi.fn(),
  syncReleasesFromJira: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("audit-id") }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: {
      findMany: mocks.findManyIssues,
      count: mocks.countIssues,
      groupBy: mocks.groupByIssues,
    },
    jiraProject: {
      findMany: mocks.findManyProjects,
    },
    release: {
      findMany: mocks.findManyReleases,
    },
    branchInfo: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    integrationCursor: {
      findUnique: mocks.findUniqueCursor,
      findMany: mocks.findManyCursors,
    },
    $transaction: (promises: unknown[]) => Promise.all(promises),
  },
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      jiraFreshnessMinutes: 30,
    },
    // Invariant: DYN is NOT in the static env lists!
    isKnownProject: (p: string) => ["MR", "EPM"].includes(p),
    jiraProjectList: ["MR", "EPM"],
  };
});

vi.mock("@/lib/jira/project-catalog", () => ({
  listActiveProjects: vi.fn().mockResolvedValue([
    { key: "MR", name: "MR Project", active: true, syncEnabled: true },
    { key: "DYN", name: "Dynamic Project", active: true, syncEnabled: true },
  ]),
  normalizeProjectKey: (k: string) => k.trim().toUpperCase(),
}));

vi.mock("@/lib/releases/sync", () => ({
  syncReleasesFromJira: mocks.syncReleasesFromJira,
  JIRA_RELEASES_INTEGRATION: "jira-releases",
}));

describe("Dynamic Project Cross-Feature Integration (DYN not in env)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-dynamic", role: "admin" } });
    mocks.user.mockResolvedValue({
      jiraUsername: "dyn_user",
      boardProjects: ["DYN"],
    });
    mocks.findManyProjects.mockResolvedValue([
      { key: "MR", name: "MR Project", active: true },
      { key: "DYN", name: "Dynamic Project", active: true },
    ]);
    mocks.findManyIssues.mockResolvedValue([]);
    mocks.countIssues.mockResolvedValue(0);
    mocks.groupByIssues.mockResolvedValue([
      { projectKey: "MR", _count: { _all: 5 } },
      { projectKey: "DYN", _count: { _all: 10 } },
    ]);
    mocks.findManyReleases.mockResolvedValue([]);
    mocks.findUniqueCursor.mockResolvedValue(null);
    mocks.findManyCursors.mockResolvedValue([]);
  });

  it("1. /api/projects includes dynamic project DYN", async () => {
    mocks.countIssues.mockResolvedValue(42);
    const res = await getProjects();
    expect(res.status).toBe(200);
    const json = await res.json();
    const dyn = json.items.find((p: any) => p.key === "DYN");
    expect(dyn).toBeDefined();
    expect(dyn.key).toBe("DYN");
  });

  it("2. /api/issues?project=DYN scopes queries directly to DYN without falling back", async () => {
    mocks.findManyIssues.mockResolvedValue([
      {
        jiraKey: "DYN-101",
        projectKey: "DYN",
        summary: "Dynamic task",
        status: "In Progress",
        statusCategory: "indeterminate",
        labels: [],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "High",
        points: 3,
        updatedAt: new Date(),
      },
    ]);
    mocks.countIssues.mockResolvedValue(1);

    const res = await getIssues(new Request("http://localhost/api/issues?project=DYN&assignee=ALL"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.total).toBe(1);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].jiraKey).toBe("DYN-101");
    expect(mocks.findManyIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectKey: { in: ["DYN"] },
        }),
      })
    );
  });

  it("3. GET /api/releases?projectKey=DYN reads pure DB and returns never_synced when not synced yet", async () => {
    const res = await getReleases(new Request("http://localhost/api/releases?projectKey=DYN"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.items).toEqual([]);
    expect(json.sync.state).toBe("never_synced");
    // Verifies that GET no longer executes syncReleasesFromJira
    expect(mocks.syncReleasesFromJira).not.toHaveBeenCalled();
  });

  it("4. POST /api/releases/sync?projectKey=DYN dispatches sync for dynamic project DYN", async () => {
    mocks.syncReleasesFromJira.mockResolvedValue({
      syncedProjects: ["DYN"],
      totalReleases: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errors: [],
      projects: [
        {
          projectKey: "DYN",
          state: "empty",
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
          errorCode: null,
          errorMessage: null,
        },
      ],
    });

    const res = await syncReleases(
      new Request("http://localhost/api/releases/sync?projectKey=DYN", { method: "POST" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(mocks.syncReleasesFromJira).toHaveBeenCalledWith({
      userId: "user-dynamic",
      projectKeys: ["DYN"],
    });
    expect(json.result.projects[0].state).toBe("empty");
  });
});
