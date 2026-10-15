import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getProjectLeaders,
  isProjectLeader,
  listProjectsLedBy,
  canUserManageProjectLeaders,
  canUserManageAnyProjectLeaders,
  setProjectLeaders,
} from "./roles";

const { mockProjectMember, mockTransaction } = vi.hoisted(() => {
  const mockProjectMember = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  };
  const mockTransaction = vi.fn(async (cb: (tx: { projectMember: typeof mockProjectMember }) => Promise<unknown>) => {
    return cb({
      projectMember: mockProjectMember,
    });
  });
  return { mockProjectMember, mockTransaction };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectMember: mockProjectMember,
    $transaction: mockTransaction,
  },
}));

describe("project roles service", () => {
  beforeEach(() => {
    mockProjectMember.findMany.mockReset();
    mockProjectMember.findFirst.mockReset();
    mockProjectMember.deleteMany.mockReset();
    mockProjectMember.upsert.mockReset();
    vi.clearAllMocks();
  });

  describe("getProjectLeaders", () => {
    it("returns empty array when projectKey is empty", async () => {
      const result = await getProjectLeaders("");
      expect(result).toEqual([]);
      expect(mockProjectMember.findMany).not.toHaveBeenCalled();
    });

    it("returns users when project has leaders", async () => {
      const mockUsers = [
        { id: "u-1", displayName: "Leader 1", role: "member" },
        { id: "u-2", displayName: "Leader 2", role: "lead" },
      ];
      mockProjectMember.findMany.mockResolvedValueOnce([
        { projectKey: "EPM", userId: "u-1", role: "leader", user: mockUsers[0] },
        { projectKey: "EPM", userId: "u-2", role: "leader", user: mockUsers[1] },
      ]);

      const result = await getProjectLeaders("epm");
      expect(result).toEqual(mockUsers);
      expect(mockProjectMember.findMany).toHaveBeenCalledWith({
        where: { projectKey: "EPM", role: "leader" },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
    });
  });

  describe("isProjectLeader", () => {
    it("returns true when member record exists", async () => {
      mockProjectMember.findFirst.mockResolvedValueOnce({ userId: "u-1" });
      const result = await isProjectLeader("EPM", "u-1");
      expect(result).toBe(true);
      expect(mockProjectMember.findFirst).toHaveBeenCalledWith({
        where: { projectKey: "EPM", userId: "u-1", role: "leader" },
        select: { userId: true },
      });
    });

    it("returns false when member record does not exist", async () => {
      mockProjectMember.findFirst.mockResolvedValueOnce(null);
      const result = await isProjectLeader("EPM", "u-99");
      expect(result).toBe(false);
    });
  });

  describe("listProjectsLedBy", () => {
    it("returns list of project keys", async () => {
      mockProjectMember.findMany.mockResolvedValueOnce([
        { projectKey: "CICM" },
        { projectKey: "EPM" },
      ]);

      const result = await listProjectsLedBy("u-1");
      expect(result).toEqual(["CICM", "EPM"]);
    });

    it("returns empty list if userId is empty", async () => {
      const result = await listProjectsLedBy("");
      expect(result).toEqual([]);
    });
  });

  describe("canUserManageProjectLeaders", () => {
    it("returns false when session user is missing or has no id", async () => {
      expect(await canUserManageProjectLeaders(null, "EPM")).toBe(false);
      expect(await canUserManageProjectLeaders({}, "EPM")).toBe(false);
    });

    it("returns true for admin users without querying leader table", async () => {
      const result = await canUserManageProjectLeaders(
        { id: "admin-1", role: "admin" },
        "EPM"
      );
      expect(result).toBe(true);
      expect(mockProjectMember.findFirst).not.toHaveBeenCalled();
    });

    it("returns true for a project leader of the target project", async () => {
      mockProjectMember.findFirst.mockResolvedValueOnce({ userId: "lead-1" });
      const result = await canUserManageProjectLeaders(
        { id: "lead-1", role: "member" },
        "EPM"
      );
      expect(result).toBe(true);
    });

    it("returns false for a non-admin who is not a leader of the project", async () => {
      mockProjectMember.findFirst.mockResolvedValueOnce(null);
      const result = await canUserManageProjectLeaders(
        { id: "user-2", role: "lead" },
        "EPM"
      );
      expect(result).toBe(false);
    });
  });

  describe("canUserManageAnyProjectLeaders", () => {
    it("returns false when session user is missing or has no id", async () => {
      expect(await canUserManageAnyProjectLeaders(null)).toBe(false);
      expect(await canUserManageAnyProjectLeaders({})).toBe(false);
    });

    it("returns true for admin users without querying leader table", async () => {
      const result = await canUserManageAnyProjectLeaders({ id: "admin-1", role: "admin" });
      expect(result).toBe(true);
      expect(mockProjectMember.findMany).not.toHaveBeenCalled();
    });

    it("returns true for a user who leads at least one project", async () => {
      mockProjectMember.findMany.mockResolvedValueOnce([{ projectKey: "EPM" }]);
      const result = await canUserManageAnyProjectLeaders({ id: "lead-1", role: "member" });
      expect(result).toBe(true);
    });

    it("returns false for a non-admin who leads no projects", async () => {
      mockProjectMember.findMany.mockResolvedValueOnce([]);
      const result = await canUserManageAnyProjectLeaders({ id: "member-1", role: "member" });
      expect(result).toBe(false);
    });
  });

  describe("setProjectLeaders", () => {
    it("atomically replaces leaders and returns added/removed diff", async () => {
      // Current members in DB: u-1, u-2
      mockProjectMember.findMany
        .mockResolvedValueOnce([
          { userId: "u-1" },
          { userId: "u-2" },
        ])
        // Fetch updated members at the end
        .mockResolvedValueOnce([
          { projectKey: "EPM", userId: "u-2", user: { id: "u-2" } },
          { projectKey: "EPM", userId: "u-3", user: { id: "u-3" } },
        ]);

      const result = await setProjectLeaders("EPM", ["u-2", "u-3"], "actor-admin");

      expect(mockProjectMember.deleteMany).toHaveBeenCalledWith({
        where: {
          projectKey: "EPM",
          userId: { in: ["u-1"] },
          role: "leader",
        },
      });

      expect(mockProjectMember.upsert).toHaveBeenCalledWith({
        where: {
          projectKey_userId: {
            projectKey: "EPM",
            userId: "u-3",
          },
        },
        create: {
          projectKey: "EPM",
          userId: "u-3",
          role: "leader",
          assignedById: "actor-admin",
        },
        update: {
          role: "leader",
          assignedById: "actor-admin",
        },
      });

      expect(result.added).toEqual(["u-3"]);
      expect(result.removed).toEqual(["u-1"]);
      expect(result.leaders).toEqual([{ id: "u-2" }, { id: "u-3" }]);
    });
  });
});
