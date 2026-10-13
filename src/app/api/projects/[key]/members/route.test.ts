import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "./route";

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      getSession: vi.fn(),
      getProjectLeaders: vi.fn(),
      setProjectLeaders: vi.fn(),
      canUserManageProjectLeaders: vi.fn(),
      audit: vi.fn(),
      userFindMany: vi.fn(),
    },
  };
});

vi.mock("@/lib/session", () => ({
  getSession: () => mocks.getSession(),
}));

vi.mock("@/lib/projects/roles", () => ({
  getProjectLeaders: (...args: unknown[]) => mocks.getProjectLeaders(...args),
  setProjectLeaders: (...args: unknown[]) => mocks.setProjectLeaders(...args),
  canUserManageProjectLeaders: (...args: unknown[]) =>
    mocks.canUserManageProjectLeaders(...args),
}));

vi.mock("@/lib/audit", () => ({
  audit: (...args: unknown[]) => mocks.audit(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mocks.userFindMany(...args),
    },
  },
}));

describe("GET & PUT /api/projects/[key]/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 if unauthenticated", async () => {
      mocks.getSession.mockResolvedValueOnce(null);
      const res = await GET(new Request("http://localhost/api/projects/EPM/members"), {
        params: Promise.resolve({ key: "EPM" }),
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 if project key is invalid", async () => {
      mocks.getSession.mockResolvedValueOnce({ user: { id: "u-1" } });
      const res = await GET(new Request("http://localhost/api/projects/invalid!key/members"), {
        params: Promise.resolve({ key: "invalid!key" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 200 with leaders and canManage status", async () => {
      mocks.getSession.mockResolvedValueOnce({
        user: { id: "u-1", role: "member" },
      });
      mocks.getProjectLeaders.mockResolvedValueOnce([
        {
          id: "u-lead",
          displayName: "Project Leader",
          email: "lead@example.com",
          jiraUsername: "lead_j",
          role: "member",
        },
      ]);
      mocks.canUserManageProjectLeaders.mockResolvedValueOnce(true);

      const res = await GET(new Request("http://localhost/api/projects/EPM/members"), {
        params: Promise.resolve({ key: "EPM" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.projectKey).toBe("EPM");
      expect(json.canManage).toBe(true);
      expect(json.leaders).toHaveLength(1);
      expect(json.leaders[0].id).toBe("u-lead");
    });
  });

  describe("PUT", () => {
    it("returns 401 if unauthenticated", async () => {
      mocks.getSession.mockResolvedValueOnce(null);
      const res = await PUT(
        new Request("http://localhost/api/projects/EPM/members", {
          method: "PUT",
          body: JSON.stringify({ leaderUserIds: ["u-1"] }),
        }),
        { params: Promise.resolve({ key: "EPM" }) }
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 if user cannot manage project leaders", async () => {
      mocks.getSession.mockResolvedValueOnce({
        user: { id: "u-random", role: "member" },
      });
      mocks.canUserManageProjectLeaders.mockResolvedValueOnce(false);

      const res = await PUT(
        new Request("http://localhost/api/projects/EPM/members", {
          method: "PUT",
          body: JSON.stringify({ leaderUserIds: ["u-1"] }),
        }),
        { params: Promise.resolve({ key: "EPM" }) }
      );
      expect(res.status).toBe(403);
    });

    it("returns 400 if leaderUserIds is not an array", async () => {
      mocks.getSession.mockResolvedValueOnce({
        user: { id: "admin-1", role: "admin" },
      });
      mocks.canUserManageProjectLeaders.mockResolvedValueOnce(true);

      const res = await PUT(
        new Request("http://localhost/api/projects/EPM/members", {
          method: "PUT",
          body: JSON.stringify({ leaderUserIds: "invalid" }),
        }),
        { params: Promise.resolve({ key: "EPM" }) }
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 if one or more user IDs do not exist", async () => {
      mocks.getSession.mockResolvedValueOnce({
        user: { id: "admin-1", role: "admin" },
      });
      mocks.canUserManageProjectLeaders.mockResolvedValueOnce(true);
      // u-nonexistent does not exist
      mocks.userFindMany.mockResolvedValueOnce([{ id: "u-1" }]);

      const res = await PUT(
        new Request("http://localhost/api/projects/EPM/members", {
          method: "PUT",
          body: JSON.stringify({ leaderUserIds: ["u-1", "u-nonexistent"] }),
        }),
        { params: Promise.resolve({ key: "EPM" }) }
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("user IDs do not exist");
    });

    it("updates leaders and logs audit when authorized", async () => {
      mocks.getSession.mockResolvedValueOnce({
        user: { id: "admin-1", email: "admin@example.com", role: "admin" },
      });
      mocks.canUserManageProjectLeaders.mockResolvedValueOnce(true);
      mocks.userFindMany.mockResolvedValueOnce([{ id: "u-1" }, { id: "u-2" }]);
      mocks.getProjectLeaders.mockResolvedValueOnce([{ id: "u-1" }]);
      mocks.setProjectLeaders.mockResolvedValueOnce({
        projectKey: "EPM",
        leaders: [
          {
            id: "u-1",
            displayName: "Leader 1",
            email: "l1@example.com",
            jiraUsername: "l1",
            role: "member",
          },
          {
            id: "u-2",
            displayName: "Leader 2",
            email: "l2@example.com",
            jiraUsername: "l2",
            role: "lead",
          },
        ],
        added: ["u-2"],
        removed: [],
      });

      const res = await PUT(
        new Request("http://localhost/api/projects/EPM/members", {
          method: "PUT",
          body: JSON.stringify({ leaderUserIds: ["u-1", "u-2"] }),
        }),
        { params: Promise.resolve({ key: "EPM" }) }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.leaders).toHaveLength(2);
      expect(mocks.audit).toHaveBeenCalledWith({
        actorId: "admin-1",
        actorEmail: "admin@example.com",
        action: "project.leader.set",
        source: "web",
        target: "EPM",
        before: { leaderUserIds: ["u-1"] },
        after: { leaderUserIds: ["u-1", "u-2"] },
      });
    });
  });
});
