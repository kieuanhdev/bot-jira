import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findReleaseById,
  updateReleaseStatus,
  updateReleaseMetadata,
  persistReleaseCheckResult,
  getReleaseCheckHistory,
  listReleaseGateOverrides,
  createReleaseGateOverride,
  revokeReleaseGateOverride,
  listReleaseApprovals,
  createReleaseApproval,
  revokeReleaseApproval,
  attachReleaseIssues,
  syncReleaseTasksFromIssues,
  NON_OVERRIDABLE_GATES,
} from "./repository";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    release: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    releaseCheck: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    releaseGateOverride: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    releaseApproval: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    releaseTask: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return { prismaMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Release Repository", () => {
  describe("findReleaseById", () => {
    it("delegates to prisma.release.findUnique", async () => {
      prismaMock.release.findUnique.mockResolvedValue({ id: "r1", version: "1.0" });
      const res = await findReleaseById("r1");
      expect(res).toEqual({ id: "r1", version: "1.0" });
      expect(prismaMock.release.findUnique).toHaveBeenCalledWith({ where: { id: "r1" } });
    });
  });

  describe("updateReleaseStatus", () => {
    it("updates release status and releasedAt", async () => {
      const now = new Date();
      prismaMock.release.update.mockResolvedValue({ id: "r1", version: "1.0", status: "released", releasedAt: now });
      const res = await updateReleaseStatus("r1", "released", now);
      expect(res.status).toBe("released");
      expect(prismaMock.release.update).toHaveBeenCalledWith({
        where: { id: "r1" },
        data: { status: "released", releasedAt: now },
        select: { id: true, version: true, releasedAt: true, status: true },
      });
    });
  });

  describe("updateReleaseMetadata", () => {
    it("updates notes and description", async () => {
      prismaMock.release.update.mockResolvedValue({ id: "r1", notes: "n", description: "d" });
      const res = await updateReleaseMetadata("r1", { notes: "n", description: "d" });
      expect(res.notes).toBe("n");
      expect(prismaMock.release.update).toHaveBeenCalledWith({
        where: { id: "r1" },
        data: { notes: "n", description: "d" },
      });
    });
  });

  describe("persistReleaseCheckResult", () => {
    it("updates release status and creates releaseCheck with per-gate results", async () => {
      prismaMock.release.update.mockResolvedValue({ id: "r1", status: "ready" });
      prismaMock.releaseCheck.create.mockResolvedValue({ id: "chk-1", status: "ready", gates: [] });

      const res = await persistReleaseCheckResult("r1", {
        status: "ready",
        summary: "Release is ready",
        blockers: [],
        sourceTimes: { jira: "2026-10-09T00:00:00Z" },
        gates: [
          {
            gate: "task_status",
            state: "passed",
            summary: "All done",
            details: {},
            blockers: [],
          },
        ],
        triggeredBy: "user@test.io",
      });

      expect(res.id).toBe("chk-1");
      expect(prismaMock.release.update).toHaveBeenCalledWith({
        where: { id: "r1" },
        data: { status: "ready" },
      });
      expect(prismaMock.releaseCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            releaseId: "r1",
            triggeredBy: "user@test.io",
            status: "ready",
            summary: "Release is ready",
          }),
          include: { gates: true },
        })
      );
    });
  });

  describe("getReleaseCheckHistory", () => {
    it("returns paginated checks with gates in correct order", async () => {
      prismaMock.releaseCheck.count.mockResolvedValue(1);
      prismaMock.releaseCheck.findMany.mockResolvedValue([
        {
          id: "chk-1",
          triggeredBy: "mgr@test.io",
          status: "ready",
          summary: "Summary",
          blockers: [],
          sourceTimes: {},
          createdAt: new Date("2026-10-09T01:00:00Z"),
          gates: [
            {
              id: "g-1",
              gate: "task_status",
              state: "passed",
              summary: "Done",
              details: null,
              sourceTime: null,
              createdAt: new Date("2026-10-09T01:00:00Z"),
            },
          ],
        },
      ]);

      const res = await getReleaseCheckHistory("r1", { limit: 10, offset: 0 });
      expect(res.total).toBe(1);
      expect(res.checks).toHaveLength(1);
      expect(res.checks[0].gates).toHaveLength(1);
      expect(prismaMock.releaseCheck.findMany).toHaveBeenCalledWith({
        where: { releaseId: "r1" },
        include: { gates: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 10,
        skip: 0,
      });
    });
  });

  describe("Gate Overrides", () => {
    it("listReleaseGateOverrides queries releaseGateOverride table", async () => {
      prismaMock.releaseGateOverride.findMany.mockResolvedValue([]);
      const res = await listReleaseGateOverrides("r1");
      expect(res).toEqual([]);
      expect(prismaMock.releaseGateOverride.findMany).toHaveBeenCalledWith({
        where: { releaseId: "r1" },
        select: expect.any(Object),
      });
    });

    it("createReleaseGateOverride rejects empty gate", async () => {
      await expect(
        createReleaseGateOverride("r1", { gate: "   ", reason: "Valid", createdById: "u1" })
      ).rejects.toThrow("gate required");
    });

    it("createReleaseGateOverride rejects empty reason", async () => {
      await expect(
        createReleaseGateOverride("r1", { gate: "data_freshness", reason: "", createdById: "u1" })
      ).rejects.toThrow("reason required");
    });

    it("createReleaseGateOverride rejects non-overridable gates", async () => {
      for (const nonOverridable of NON_OVERRIDABLE_GATES) {
        await expect(
          createReleaseGateOverride("r1", { gate: nonOverridable, reason: "Bypass", createdById: "u1" })
        ).rejects.toThrow(`gate "${nonOverridable}" cannot be overridden`);
      }
    });

    it("createReleaseGateOverride creates row for overridable gate", async () => {
      prismaMock.releaseGateOverride.create.mockResolvedValue({ id: "ov-1", gate: "data_freshness" });
      const res = await createReleaseGateOverride("r1", {
        gate: "data_freshness",
        reason: "Offline environment",
        createdById: "u1",
      });
      expect(res.id).toBe("ov-1");
      expect(prismaMock.releaseGateOverride.create).toHaveBeenCalledWith({
        data: {
          releaseId: "r1",
          gate: "data_freshness",
          reason: "Offline environment",
          createdById: "u1",
          expiresAt: null,
        },
      });
    });

    it("revokeReleaseGateOverride returns null if override not found or releaseId mismatch", async () => {
      prismaMock.releaseGateOverride.findUnique.mockResolvedValue(null);
      expect(await revokeReleaseGateOverride("ov-1", "r1")).toBeNull();

      prismaMock.releaseGateOverride.findUnique.mockResolvedValue({ id: "ov-1", releaseId: "other" });
      expect(await revokeReleaseGateOverride("ov-1", "r1")).toBeNull();
    });

    it("revokeReleaseGateOverride sets revokedAt when matched", async () => {
      prismaMock.releaseGateOverride.findUnique.mockResolvedValue({ id: "ov-1", releaseId: "r1", gate: "data_freshness" });
      prismaMock.releaseGateOverride.update.mockResolvedValue({ id: "ov-1", revokedAt: new Date() });
      const res = await revokeReleaseGateOverride("ov-1", "r1");
      expect(res).not.toBeNull();
      expect(prismaMock.releaseGateOverride.update).toHaveBeenCalledWith({
        where: { id: "ov-1" },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe("Release Approvals", () => {
    it("listReleaseApprovals queries releaseApproval table", async () => {
      prismaMock.releaseApproval.findMany.mockResolvedValue([]);
      const res = await listReleaseApprovals("r1");
      expect(res).toEqual([]);
      expect(prismaMock.releaseApproval.findMany).toHaveBeenCalledWith({ where: { releaseId: "r1" } });
    });

    it("createReleaseApproval rejects invalid approval type", async () => {
      await expect(
        createReleaseApproval("r1", { type: "lead" as unknown as "qa", approvedById: "u1" })
      ).rejects.toThrow("invalid approval type");
    });

    it("createReleaseApproval creates approval row", async () => {
      prismaMock.releaseApproval.create.mockResolvedValue({ id: "app-1", type: "qa" });
      const res = await createReleaseApproval("r1", { type: "qa", approvedById: "u1", note: "Tested" });
      expect(res.id).toBe("app-1");
      expect(prismaMock.releaseApproval.create).toHaveBeenCalledWith({
        data: {
          releaseId: "r1",
          type: "qa",
          approvedById: "u1",
          note: "Tested",
        },
      });
    });

    it("revokeReleaseApproval returns not_found if not found or releaseId mismatch", async () => {
      prismaMock.releaseApproval.findUnique.mockResolvedValue(null);
      expect(await revokeReleaseApproval("app-1", "r1", { id: "u1", role: "admin" })).toEqual({
        error: "not_found",
      });

      prismaMock.releaseApproval.findUnique.mockResolvedValue({ id: "app-1", releaseId: "other" });
      expect(await revokeReleaseApproval("app-1", "r1", { id: "u1", role: "admin" })).toEqual({
        error: "not_found",
      });
    });

    it("revokeReleaseApproval returns forbidden if actor is neither approver nor admin", async () => {
      prismaMock.releaseApproval.findUnique.mockResolvedValue({ id: "app-1", releaseId: "r1", approvedById: "other-user" });
      const res = await revokeReleaseApproval("app-1", "r1", { id: "u1", role: "member" });
      expect(res).toEqual({ error: "forbidden" });
      expect(prismaMock.releaseApproval.update).not.toHaveBeenCalled();
    });

    it("revokeReleaseApproval allows approver or admin to revoke", async () => {
      prismaMock.releaseApproval.findUnique.mockResolvedValue({ id: "app-1", releaseId: "r1", approvedById: "u1" });
      prismaMock.releaseApproval.update.mockResolvedValue({ id: "app-1", revokedAt: new Date() });

      const res1 = await revokeReleaseApproval("app-1", "r1", { id: "u1", role: "member" });
      expect(res1.ok).toBe(true);

      prismaMock.releaseApproval.findUnique.mockResolvedValue({ id: "app-1", releaseId: "r1", approvedById: "someone-else" });
      const res2 = await revokeReleaseApproval("app-1", "r1", { id: "admin-1", role: "admin" });
      expect(res2.ok).toBe(true);
    });
  });

  describe("Task Linking", () => {
    it("attachReleaseIssues creates rows with skipDuplicates", async () => {
      prismaMock.releaseTask.createMany.mockResolvedValue({ count: 2 });
      const res = await attachReleaseIssues("r1", ["EPM-1", "EPM-2"]);
      expect(res.count).toBe(2);
      expect(prismaMock.releaseTask.createMany).toHaveBeenCalledWith({
        data: [{ releaseId: "r1", jiraKey: "EPM-1" }, { releaseId: "r1", jiraKey: "EPM-2" }],
        skipDuplicates: true,
      });
    });

    it("syncReleaseTasksFromIssues adds new tasks and deletes unattached tasks", async () => {
      prismaMock.releaseTask.createMany.mockResolvedValue({ count: 1 });
      prismaMock.releaseTask.deleteMany.mockResolvedValue({ count: 1 });

      await syncReleaseTasksFromIssues("r1", ["EPM-1"]);
      expect(prismaMock.releaseTask.createMany).toHaveBeenCalledWith({
        data: [{ releaseId: "r1", jiraKey: "EPM-1" }],
        skipDuplicates: true,
      });
      expect(prismaMock.releaseTask.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: "r1", jiraKey: { notIn: ["EPM-1"] } },
      });

      await syncReleaseTasksFromIssues("r1", []);
      expect(prismaMock.releaseTask.deleteMany).toHaveBeenCalledWith({
        where: { releaseId: "r1" },
      });
    });
  });
});
