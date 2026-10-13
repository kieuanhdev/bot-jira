import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeProjectKey,
  isValidProjectKeyFormat,
  listActiveProjects,
  listSyncEnabledProjectKeys,
  getCatalogProject,
  isCatalogProject,
  registerVerifiedProject,
  archiveProject,
  isProjectSyncEnabled,
  listSyncDisabledProjectKeys,
  setProjectSyncEnabled,
} from "./project-catalog";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jiraProject: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("project-catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("key normalization and validation", () => {
    it("normalizes and trims project keys to uppercase", () => {
      expect(normalizeProjectKey("  epm  ")).toBe("EPM");
      expect(normalizeProjectKey("cicm\n")).toBe("CICM");
      expect(normalizeProjectKey("")).toBe("");
    });

    it("validates project key format correctly", () => {
      expect(isValidProjectKeyFormat("EPM")).toBe(true);
      expect(isValidProjectKeyFormat("PROJECT_1")).toBe(true);
      expect(isValidProjectKeyFormat("p")).toBe(false); // too short (<2 chars)
      expect(isValidProjectKeyFormat("123")).toBe(false); // must start with uppercase letter
      expect(isValidProjectKeyFormat("TOOLONGA_VERY_LONG_PROJECT_KEY_OVER_TWENTY")).toBe(false);
    });
  });

  describe("listActiveProjects", () => {
    it("returns only active projects from database", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([
        {
          key: "EPM",
          name: "Enterprise Project",
          active: true,
          syncEnabled: true,
          bootstrapState: "ready",
          lastBootstrapAt: new Date(),
          lastBootstrapError: null,
          source: "bootstrap",
        } as never,
      ]);

      const projects = await listActiveProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].key).toBe("EPM");
      expect(prisma.jiraProject.findMany).toHaveBeenCalledWith({
        where: { active: true },
        orderBy: [{ key: "asc" }],
        select: expect.any(Object),
      });
    });

    it("falls back to bootstrap env projects if DB returns empty", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([]);

      const projects = await listActiveProjects();
      expect(projects.length).toBeGreaterThan(0);
      expect(projects.some((p) => p.key === "EPM")).toBe(true);
    });

    it("falls back to bootstrap env projects if DB throws an error", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockRejectedValueOnce(new Error("Connection timeout"));

      const projects = await listActiveProjects();
      expect(projects.length).toBeGreaterThan(0);
      expect(projects.some((p) => p.key === "CICM")).toBe(true);
    });
  });

  describe("listSyncEnabledProjectKeys", () => {
    it("returns keys of active projects with sync enabled", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([
        { key: "CICM" },
        { key: "EPM" },
      ] as never);

      const keys = await listSyncEnabledProjectKeys();
      expect(keys).toEqual(["CICM", "EPM"]);
      expect(prisma.jiraProject.findMany).toHaveBeenCalledWith({
        where: { active: true, syncEnabled: true },
        orderBy: [{ key: "asc" }],
        select: { key: true },
      });
    });

    it("falls back to env projects only when the catalog is empty", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.jiraProject.count).mockResolvedValueOnce(0);

      const keys = await listSyncEnabledProjectKeys();
      expect(keys.length).toBeGreaterThan(0);
    });

    it("returns no keys when every catalog project has sync disabled", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.jiraProject.count).mockResolvedValueOnce(3);

      await expect(listSyncEnabledProjectKeys()).resolves.toEqual([]);
    });
  });

  describe("sync toggle helpers", () => {
    it("lists disabled or archived projects as upper-case keys", async () => {
      vi.mocked(prisma.jiraProject.findMany).mockResolvedValueOnce([
        { key: "epm" },
        { key: "CICM" },
      ] as never);

      const keys = await listSyncDisabledProjectKeys();
      expect([...keys].sort()).toEqual(["CICM", "EPM"]);
      expect(prisma.jiraProject.findMany).toHaveBeenCalledWith({
        where: { OR: [{ active: false }, { syncEnabled: false }] },
        select: { key: true },
      });
    });

    it("treats a disabled catalog project as not syncable", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce({ active: true, syncEnabled: false } as never);
      await expect(isProjectSyncEnabled("epm")).resolves.toBe(false);
    });

    it("keeps syncing projects that are not in the catalog", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce(null);
      await expect(isProjectSyncEnabled("NEW")).resolves.toBe(true);
    });

    it("updates the flag and reports the previous value", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce({ key: "EPM", syncEnabled: true } as never);
      vi.mocked(prisma.jiraProject.update).mockResolvedValueOnce({ key: "EPM", syncEnabled: false } as never);

      await expect(setProjectSyncEnabled("epm", false)).resolves.toEqual({
        key: "EPM",
        syncEnabled: false,
        previous: true,
      });
      expect(prisma.jiraProject.update).toHaveBeenCalledWith({
        where: { key: "EPM" },
        data: { syncEnabled: false },
        select: { key: true, syncEnabled: true },
      });
    });

    it("returns null for an unknown project", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce(null);
      await expect(setProjectSyncEnabled("NOPE", true)).resolves.toBeNull();
      expect(prisma.jiraProject.update).not.toHaveBeenCalled();
    });
  });

  describe("getCatalogProject and isCatalogProject", () => {
    it("returns project catalog details by key", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce({
        key: "EPM",
        name: "Enterprise",
        active: true,
        syncEnabled: true,
        bootstrapState: "ready",
        lastBootstrapAt: null,
        lastBootstrapError: null,
        source: "bootstrap",
      } as never);

      const project = await getCatalogProject("epm");
      expect(project?.key).toBe("EPM");
      expect(prisma.jiraProject.findUnique).toHaveBeenCalledWith({
        where: { key: "EPM" },
        select: expect.any(Object),
      });
    });

    it("isCatalogProject returns false for unknown or inactive projects", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce(null);
      expect(await isCatalogProject("UNKNOWN")).toBe(false);

      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce({
        key: "OLD",
        name: "Old Project",
        active: false,
        syncEnabled: false,
      } as never);
      expect(await isCatalogProject("OLD")).toBe(false);
    });
  });

  describe("registerVerifiedProject", () => {
    it("creates a new JiraProject if not present", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.jiraProject.create).mockResolvedValueOnce({
        key: "NEWPROJ",
        name: "New Project",
        active: true,
        syncEnabled: true,
        bootstrapState: "ready",
        lastBootstrapAt: new Date(),
        lastBootstrapError: null,
        source: "user_added",
      } as never);

      const res = await registerVerifiedProject({
        key: "newproj",
        name: "New Project",
        jiraId: "12345",
        discoveredById: "user-1",
        source: "user_added",
      });

      expect(res.key).toBe("NEWPROJ");
      expect(prisma.jiraProject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: "NEWPROJ",
          name: "New Project",
          jiraId: "12345",
          active: true,
          syncEnabled: true,
          source: "user_added",
          discoveredById: "user-1",
        }),
        select: expect.any(Object),
      });
    });

    it("updates existing JiraProject idempotently", async () => {
      vi.mocked(prisma.jiraProject.findUnique).mockResolvedValueOnce({
        id: "proj_1",
        key: "EPM",
        name: "Old Name",
        jiraId: null,
        active: false,
      } as never);
      vi.mocked(prisma.jiraProject.update).mockResolvedValueOnce({
        key: "EPM",
        name: "Enterprise Project Management",
        active: true,
        syncEnabled: true,
        bootstrapState: "ready",
        lastBootstrapAt: null,
        lastBootstrapError: null,
        source: "bootstrap",
      } as never);

      const res = await registerVerifiedProject({
        key: "epm",
        name: "Enterprise Project Management",
        jiraId: "999",
      });

      expect(res.name).toBe("Enterprise Project Management");
      expect(prisma.jiraProject.update).toHaveBeenCalledWith({
        where: { key: "EPM" },
        data: expect.objectContaining({
          name: "Enterprise Project Management",
          jiraId: "999",
          active: true,
        }),
        select: expect.any(Object),
      });
      const data = vi.mocked(prisma.jiraProject.update).mock.calls[0][0].data;
      expect(data).not.toHaveProperty("syncEnabled");
    });

    it("throws an error if key format is invalid", async () => {
      await expect(
        registerVerifiedProject({ key: "invalid#key", name: "Invalid" })
      ).rejects.toThrow("Invalid project key format");
    });
  });

  describe("archiveProject", () => {
    it("deactivates the project and disables sync", async () => {
      vi.mocked(prisma.jiraProject.update).mockResolvedValueOnce({} as never);

      await archiveProject("EPM");
      expect(prisma.jiraProject.update).toHaveBeenCalledWith({
        where: { key: "EPM" },
        data: {
          active: false,
          syncEnabled: false,
        },
      });
    });
  });
});
