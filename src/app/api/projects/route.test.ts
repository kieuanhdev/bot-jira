import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userUpdate: vi.fn(),
  issueGroupBy: vi.fn(),
  getProject: vi.fn(),
  enqueueJiraProjectSync: vi.fn(),
  listActiveProjects: vi.fn(),
  registerVerifiedProject: vi.fn(),
  updateProjectBootstrapState: vi.fn(),
  peopleFieldsFindMany: vi.fn(),
  peopleFieldsUpsert: vi.fn(),
  getProjectStatuses: vi.fn(),
  search: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user, update: mocks.userUpdate },
    issueCache: { groupBy: mocks.issueGroupBy },
    projectPeopleField: {
      findMany: mocks.peopleFieldsFindMany,
      upsert: mocks.peopleFieldsUpsert,
    },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "testuser", token: "secret", authMode: "Bearer" }),
  userJiraUsername: () => "testuser",
  jiraUsernameAliases: () => ["testuser"],
}));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: () => null,
  jiraWith: () => ({
    getProject: mocks.getProject,
    getProjectStatuses: mocks.getProjectStatuses,
    search: mocks.search,
  }),
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueJiraProjectSync: mocks.enqueueJiraProjectSync,
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: mocks.listActiveProjects,
    registerVerifiedProject: mocks.registerVerifiedProject,
    updateProjectBootstrapState: mocks.updateProjectBootstrapState,
  };
});

import { GET, POST } from "./route";

describe("/api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      jiraUsername: "testuser",
      jiraUserEnc: "enc",
      boardProjects: ["EPM"],
    });
    mocks.listActiveProjects.mockResolvedValue([
      { key: "EPM", name: "Enterprise Project", active: true, syncEnabled: true, bootstrapState: "ready" },
      { key: "NEW", name: "New Project", active: true, syncEnabled: true, bootstrapState: "syncing_issues" },
    ]);
    mocks.issueGroupBy.mockResolvedValue([
      { projectKey: "EPM", _count: { _all: 5 } },
    ]);
    mocks.peopleFieldsFindMany.mockResolvedValue([]);
    mocks.peopleFieldsUpsert.mockResolvedValue({});
    mocks.getProjectStatuses.mockResolvedValue([]);
    mocks.search.mockResolvedValue({ issues: [] });
  });

  describe("GET /api/projects", () => {
    it("returns active catalog items with user selection and openCount", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({
        key: "EPM",
        name: "Enterprise Project",
        selected: true,
        openCount: 5,
        dataState: "ready",
      });
      expect(data.items[1]).toEqual({
        key: "NEW",
        name: "New Project",
        selected: false,
        openCount: 0,
        dataState: "syncing_issues",
      });
    });
  });

  describe("POST /api/projects", () => {
    it("returns 400 for invalid project key format", async () => {
      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ key: "123invalid!" }),
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
    });

    it("returns 404 when project does not exist on Jira", async () => {
      const err = new Error("Not Found") as Error & { status?: number };
      err.status = 404;
      mocks.getProject.mockRejectedValueOnce(err);

      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ key: "NOTEXIST" }),
        })
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain("không tồn tại");
    });

    it("registers project, adds to user selection, and enqueues sync", async () => {
      mocks.getProject.mockResolvedValueOnce({
        key: "BRANDNEW",
        name: "Brand New App",
        id: "10099",
      });
      mocks.registerVerifiedProject.mockResolvedValueOnce({
        key: "BRANDNEW",
        name: "Brand New App",
        active: true,
        syncEnabled: true,
      });
      mocks.enqueueJiraProjectSync.mockResolvedValueOnce("job-sync-123");

      const res = await POST(
        new Request("http://localhost/api/projects", {
          method: "POST",
          body: JSON.stringify({ key: "brandnew" }),
        })
      );

      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.created).toBe(true);
      expect(data.project).toEqual({
        key: "BRANDNEW",
        name: "Brand New App",
        selected: true,
      });
      expect(data.bootstrap).toEqual({
        state: "queued",
        issueSyncJobId: "job-sync-123",
      });

      expect(mocks.registerVerifiedProject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "BRANDNEW",
          name: "Brand New App",
          jiraId: "10099",
          discoveredById: "user-1",
          source: "user_added",
        })
      );

      expect(mocks.userUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { boardProjects: ["EPM", "BRANDNEW"] },
      });

      expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith({
        projectKey: "BRANDNEW",
        full: true,
        source: "manual",
        requestedBy: "user-1",
      });
    });
  });
});
