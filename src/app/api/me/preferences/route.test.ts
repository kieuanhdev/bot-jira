import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userUpdate: vi.fn(),
  listActiveProjects: vi.fn(),
  enqueueJiraProjectSync: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.user,
      update: mocks.userUpdate,
    },
  },
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: mocks.listActiveProjects,
  };
});
vi.mock("@/lib/queue/boss", () => ({
  enqueueJiraProjectSync: mocks.enqueueJiraProjectSync,
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "testuser", token: "secret", authMode: "Bearer" }),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getProject: mocks.getProject,
  }),
}));

import { GET, PUT } from "./route";

describe("/api/me/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      boardProjects: ["EPM"],
      jiraUserEnc: "enc",
      jiraTokenEnc: "enc",
    });
    mocks.listActiveProjects.mockResolvedValue([
      { key: "CICM", active: true, syncEnabled: true },
      { key: "EPM", active: true, syncEnabled: true },
      { key: "NEW", active: true, syncEnabled: true },
    ]);
  });

  describe("GET", () => {
    it("returns user preferred projects and all active catalog keys", async () => {
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        projects: ["EPM"],
        available: ["CICM", "EPM", "NEW"],
      });
    });
  });

  describe("PUT", () => {
    it("filters out projects not in active catalog", async () => {
      mocks.getProject.mockResolvedValue({ key: "CICM" });

      const res = await PUT(
        new Request("http://localhost/api/me/preferences", {
          method: "PUT",
          body: JSON.stringify({ projects: ["EPM", "RANDOM_UNKNOWN", "CICM"] }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.projects).toEqual(["EPM", "CICM"]);
      expect(mocks.userUpdate).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { boardProjects: ["EPM", "CICM"] },
      });
      expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: "CICM" })
      );
    });

    it("rejects with 403 when user does not have permission on newly added project", async () => {
      const err = new Error("Forbidden") as Error & { status?: number };
      err.status = 403;
      mocks.getProject.mockRejectedValueOnce(err);

      const res = await PUT(
        new Request("http://localhost/api/me/preferences", {
          method: "PUT",
          body: JSON.stringify({ projects: ["EPM", "NEW"] }),
        })
      );

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("jira_project_permission_required");
      expect(mocks.userUpdate).not.toHaveBeenCalled();
    });
  });
});
