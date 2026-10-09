import { describe, it, expect, vi, beforeEach } from "vitest";
import { setEpicLinkFieldIds } from "@/lib/issues/epic";
import {
  validateBulkRequest,
  previewBulk,
  extractEpicKey,
  resolveFilterKeys,
  executeBulkOperation,
} from "./ops";
import { processWithRetry } from "./retry";
import { prisma } from "@/lib/prisma";
import * as depModule from "@/lib/issues/dependencies";

vi.mock("@/lib/notify", () => ({
  notifyUser: vi.fn().mockResolvedValue({ id: "notif-1" }),
}));

vi.mock("./retry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./retry")>();
  return {
    ...actual,
    processWithRetry: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueCache: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    bulkOperation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    bulkOperationItem: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    fixVersionPropagation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("Bulk operations dependency expansion & safe removal (DEP-06, DEP-07, DEP-08)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateBulkRequest", () => {
    it("validates add-fix-version with default and explicit dependencyScope", () => {
      const res1 = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "add-fix-version", value: "1.0.0" },
      });
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.action).toEqual({
          kind: "add-fix-version",
          value: "1.0.0",
          dependencyScope: "recursive",
        });
      }

      const res2 = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "add-fix-version", value: "1.0.0", dependencyScope: "direct" },
      });
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.action).toEqual({
          kind: "add-fix-version",
          value: "1.0.0",
          dependencyScope: "direct",
        });
      }
    });

    it("validates remove-fix-version with forceRemove", () => {
      const res = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "remove-fix-version", value: "1.0.0", forceRemove: true },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.action).toEqual({
          kind: "remove-fix-version",
          value: "1.0.0",
          dependencyScope: "recursive",
          forceRemove: true,
        });
      }
    });

    it("validates multi-field update payload and rejects mixed projects or empty fields", () => {
      const valid = validateBulkRequest({
        keys: ["EPM-1", "EPM-2"],
        action: {
          kind: "update-fields",
          value: {
            assignee: "dev_user",
            labels: ["frontend", "release-1.4"],
            priority: "High",
            points: 5,
            dueDate: "2026-10-15",
            estimate: "2h 30m",
            fixVersions: ["1.4.0", "1.5.0"],
          },
        },
      });
      expect(valid.ok).toBe(true);

      const mixed = validateBulkRequest({
        keys: ["EPM-1", "MHRM-2"],
        action: {
          kind: "update-fields",
          value: { priority: "High" },
        },
      });
      expect(mixed.ok).toBe(false);
      if (!mixed.ok) {
        expect(mixed.errors).toContain("all keys must belong to the same project");
      }

      const emptyValue = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "update-fields",
          value: {},
        },
      });
      expect(emptyValue.ok).toBe(false);

      const clearValues = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "update-fields",
          value: {
            assignee: null,
            dueDate: null,
            points: null,
            labels: [],
            fixVersions: [],
          },
        },
      });
      expect(clearValues.ok).toBe(true);
      if (clearValues.ok && clearValues.action.kind === "update-fields") {
        expect(clearValues.action.value.assignee).toBeNull();
        expect(clearValues.action.value.dueDate).toBeNull();
        expect(clearValues.action.value.points).toBeNull();
        expect(clearValues.action.value.labels).toEqual([]);
        expect(clearValues.action.value.fixVersions).toEqual([]);
      }
    });

    it("validates epic assignment and unlink in update-fields and set-epic", () => {
      const validUpdate = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "update-fields",
          value: { epic: "EPM-100" },
        },
      });
      expect(validUpdate.ok).toBe(true);
      if (validUpdate.ok && validUpdate.action.kind === "update-fields") {
        expect(validUpdate.action.value.epic).toBe("EPM-100");
      }

      const unlinkUpdate = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "update-fields",
          value: { epic: null },
        },
      });
      expect(unlinkUpdate.ok).toBe(true);
      if (unlinkUpdate.ok && unlinkUpdate.action.kind === "update-fields") {
        expect(unlinkUpdate.action.value.epic).toBeNull();
      }

      const invalidEpicKey = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "update-fields",
          value: { epic: "invalid-key" },
        },
      });
      expect(invalidEpicKey.ok).toBe(false);

      const validSetEpic = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "set-epic",
          value: "EPM-50",
        },
      });
      expect(validSetEpic.ok).toBe(true);
      if (validSetEpic.ok && validSetEpic.action.kind === "set-epic") {
        expect(validSetEpic.action.value).toBe("EPM-50");
      }

      const unlinkSetEpic = validateBulkRequest({
        keys: ["EPM-1"],
        action: {
          kind: "set-epic",
          value: null,
        },
      });
      expect(unlinkSetEpic.ok).toBe(true);
      if (unlinkSetEpic.ok && unlinkSetEpic.action.kind === "set-epic") {
        expect(unlinkSetEpic.action.value).toBeNull();
      }
    });

    it("extracts epic key correctly from raw Jira issue representations", () => {
      expect(extractEpicKey(null)).toBeNull();
      expect(extractEpicKey({})).toBeNull();
      expect(extractEpicKey({ parent: { key: "EPM-99", fields: { issuetype: { name: "Epic" } } } })).toBe("EPM-99");
      expect(extractEpicKey({ parent: { key: "EPM-98", fields: { issuetype: { name: "Story" } } } })).toBeNull();
      expect(extractEpicKey({ epic: { key: "EPM-88" } })).toBe("EPM-88");
      setEpicLinkFieldIds(["customfield_10014"]);
      expect(extractEpicKey({ customfield_10014: "EPM-77" })).toBe("EPM-77");
      setEpicLinkFieldIds([]);
    });
  });

  describe("previewBulk expansion", () => {
    it("rejects multi-field updates that mix Jira projects", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        { jiraKey: "EPM-1", projectKey: "EPM", status: "To Do", assigneeJira: null, labels: [], fixVersionIds: [], fixVersionNames: [], priority: "Medium", points: null, dueDate: null, timeSpent: null, raw: {}, updatedAt: new Date(), lastSyncedAt: new Date() },
        { jiraKey: "MHRM-1", projectKey: "MHRM", status: "To Do", assigneeJira: null, labels: [], fixVersionIds: [], fixVersionNames: [], priority: "Medium", points: null, dueDate: null, timeSpent: null, raw: {}, updatedAt: new Date(), lastSyncedAt: new Date() },
      ] as never);

      await expect(previewBulk(
        { kind: "update-fields", value: { priority: "High", labels: ["release"] } },
        ["EPM-1", "MHRM-1"],
        "user-1",
        { getTransitions: vi.fn() }
      )).rejects.toThrow("bulk_field_update_requires_single_project");
      expect(prisma.bulkOperation.create).not.toHaveBeenCalled();
    });

    it("generates full before/after preview for multi-field updates", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        {
          jiraKey: "EPM-10",
          projectKey: "EPM",
          status: "To Do",
          assigneeJira: "old_dev",
          labels: ["backend"],
          fixVersionIds: ["v1"],
          fixVersionNames: ["1.0.0"],
          priority: "Low",
          points: 2,
          dueDate: new Date("2026-10-01T00:00:00Z"),
          timeSpent: null,
          raw: {},
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      ] as never);
      vi.mocked(prisma.bulkOperation.create).mockResolvedValue({ id: "op-multi" } as never);
      vi.mocked(prisma.bulkOperationItem.createMany).mockResolvedValue({ count: 1 } as never);

      const result = await previewBulk(
        {
          kind: "update-fields",
          value: {
            assignee: "new_dev",
            labels: ["backend", "frontend"],
            priority: "High",
            points: 5,
            dueDate: "2026-10-15",
            fixVersions: ["1.1.0"],
          },
        },
        ["EPM-10"],
        "user-1",
        {
          getTransitions: vi.fn(),
          getEditMeta: vi.fn().mockResolvedValue({
            fields: {
              timetracking: { name: "Time Tracking" },
              duedate: { name: "Due Date" },
              fixVersions: { name: "Fix Versions" },
            },
          }),
          resolvePointsField: vi.fn().mockResolvedValue({ id: "customfield_10502", name: "Task Points" }),
          resolveVersionId: vi.fn().mockResolvedValue("v2"),
        }
      );

      expect(result.actionable).toBe(1);
      const item = result.items[0];
      expect(item.before.assignee).toBe("old_dev");
      expect(item.after.assignee).toBe("new_dev");
      expect(item.after.priority).toBe("High");
      expect(item.after.points).toBe(5);
      expect(item.after.dueDate).toBe("2026-10-15");
      expect(item.after.labels).toEqual(["backend", "frontend"]);
      expect(item.after.fixVersions).toEqual(["1.1.0"]);
    });

    it("resolves the editable Task Points field for each issue", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([{
        jiraKey: "EPM-4303",
        projectKey: "EPM",
        status: "To Do",
        assigneeJira: null,
        labels: [],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "Medium",
        points: null,
        dueDate: null,
        timeSpent: null,
        raw: {},
        updatedAt: new Date(),
        lastSyncedAt: new Date(),
      }] as never);
      vi.mocked(prisma.bulkOperation.create).mockResolvedValue({ id: "op-points" } as never);
      vi.mocked(prisma.bulkOperationItem.createMany).mockResolvedValue({ count: 1 } as never);

      const result = await previewBulk(
        { kind: "set-points", value: 5 },
        ["EPM-4303"],
        "user-1",
        {
          getTransitions: vi.fn(),
          resolvePointsField: vi.fn().mockResolvedValue({ id: "customfield_10502", name: "Task Points" }),
        }
      );

      expect(result.actionable).toBe(1);
      expect(result.items[0].targetField).toEqual({ id: "customfield_10502", name: "Task Points" });
      expect(result.items[0].after.points).toBe(5);
    });

    it("resolves a project-scoped Fix Version id and blocks projects where it is missing", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        {
          jiraKey: "EPM-1", projectKey: "EPM", status: "To Do", assigneeJira: null,
          labels: [], fixVersionIds: [], fixVersionNames: [], priority: "Medium", points: null,
          dueDate: null, timeSpent: null, raw: {}, updatedAt: new Date(), lastSyncedAt: new Date(),
        },
        {
          jiraKey: "MHRM-1", projectKey: "MHRM", status: "To Do", assigneeJira: null,
          labels: [], fixVersionIds: [], fixVersionNames: [], priority: "Medium", points: null,
          dueDate: null, timeSpent: null, raw: {}, updatedAt: new Date(), lastSyncedAt: new Date(),
        },
      ] as never);
      vi.mocked(prisma.bulkOperation.create).mockResolvedValue({ id: "op-version" } as never);
      vi.mocked(prisma.bulkOperationItem.createMany).mockResolvedValue({ count: 2 } as never);
      const resolveVersionId = vi.fn(async (project: string) => project === "EPM" ? "epm-version-42" : null);

      const result = await previewBulk(
        { kind: "add-fix-version", value: "1.4.2", dependencyScope: "none" },
        ["EPM-1", "MHRM-1"],
        "user-1",
        {
          getTransitions: vi.fn(),
          getEditMeta: vi.fn().mockResolvedValue({ fields: { fixVersions: { name: "Fix Version/s" } } }),
          resolveVersionId,
        }
      );

      expect(resolveVersionId).toHaveBeenCalledWith("EPM", "1.4.2");
      expect(resolveVersionId).toHaveBeenCalledWith("MHRM", "1.4.2");
      expect(result.items[0].targetVersionId).toBe("epm-version-42");
      expect(result.items[0].targetField).toEqual({ id: "fixVersions", name: "Fix Version/s" });
      expect(result.items[0].skipReason).toBeNull();
      expect(result.items[1].skipReason).toBe("version_not_found");
    });

    it("expands dependencies for add-fix-version, marks external projects as external_dependency", async () => {
      // Mock expandDependencies
      vi.spyOn(depModule, "expandDependencies").mockResolvedValue({
        roots: ["PROJ-100"],
        issues: [
          { key: "PROJ-100", depth: 0, relation: "explicit", rootKey: "PROJ-100" },
          { key: "PROJ-101", depth: 1, relation: "dependency", via: "PROJ-100", rootKey: "PROJ-100" },
          { key: "OTHER-200", depth: 1, relation: "dependency", via: "PROJ-100", rootKey: "PROJ-100" },
        ],
        edges: [
          { root: "PROJ-100", dependency: "PROJ-101" },
          { root: "PROJ-100", dependency: "OTHER-200" },
        ],
        cycles: [],
        truncated: false,
        missingKeys: [],
      });

      // Mock cached issues
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        {
          jiraKey: "PROJ-100",
          projectKey: "PROJ",
          status: "To Do",
          assigneeJira: null,
          labels: [],
          fixVersionIds: [],
          fixVersionNames: [],
          priority: "Major",
          points: null,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
        {
          jiraKey: "PROJ-101",
          projectKey: "PROJ",
          status: "To Do",
          assigneeJira: null,
          labels: [],
          fixVersionIds: [],
          fixVersionNames: [], // Missing version => actionable
          priority: "Major",
          points: null,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
        {
          jiraKey: "OTHER-200",
          projectKey: "OTHER", // Different project => external_dependency
          status: "In Progress",
          assigneeJira: null,
          labels: [],
          fixVersionIds: [],
          fixVersionNames: [],
          priority: "Major",
          points: null,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      ] as never);

      vi.mocked(prisma.bulkOperation.create).mockResolvedValue({ id: "op-1" } as never);
      vi.mocked(prisma.bulkOperationItem.createMany).mockResolvedValue({ count: 3 } as never);

      const fakeJira = { getTransitions: vi.fn() };

      const result = await previewBulk(
        { kind: "add-fix-version", value: "1.5.0", dependencyScope: "recursive" },
        ["PROJ-100"],
        "user-1",
        fakeJira
      );

      expect(result.total).toBe(3);
      expect(result.actionable).toBe(2); // PROJ-100 and PROJ-101
      expect(result.skipped).toBe(1);    // OTHER-200 is external
      expect(result.externalCount).toBe(1);

      const externalItem = result.items.find((i) => i.jiraKey === "OTHER-200");
      expect(externalItem?.skipReason).toBe("external_dependency");
      expect(externalItem?.sameProject).toBe(false);

      const depItem = result.items.find((i) => i.jiraKey === "PROJ-101");
      expect(depItem?.skipReason).toBeNull();
      expect(depItem?.sameProject).toBe(true);
      expect(depItem?.relation).toBe("dependency");
    });

    it("safe remove-version checks propagation provenance before proposing removal", async () => {
      vi.spyOn(depModule, "expandDependencies").mockResolvedValue({
        roots: ["PROJ-100"],
        issues: [
          { key: "PROJ-100", depth: 0, relation: "explicit", rootKey: "PROJ-100" },
          { key: "PROJ-101", depth: 1, relation: "dependency", via: "PROJ-100", rootKey: "PROJ-100" },
        ],
        edges: [{ root: "PROJ-100", dependency: "PROJ-101" }],
        cycles: [],
        truncated: false,
        missingKeys: [],
      });

      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        {
          jiraKey: "PROJ-100",
          projectKey: "PROJ",
          status: "Done",
          assigneeJira: null,
          labels: [],
          fixVersionIds: ["v1"],
          fixVersionNames: ["1.5.0"],
          priority: "Major",
          points: null,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
        {
          jiraKey: "PROJ-101",
          projectKey: "PROJ",
          status: "Done",
          assigneeJira: null,
          labels: [],
          fixVersionIds: ["v1"],
          fixVersionNames: ["1.5.0"],
          priority: "Major",
          points: null,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        },
      ] as never);

      vi.mocked(prisma.bulkOperation.create).mockResolvedValue({ id: "op-2" } as never);
      vi.mocked(prisma.bulkOperationItem.createMany).mockResolvedValue({ count: 2 } as never);

      // Case A: No propagation record exists => manual_or_unpropagated
      vi.mocked(prisma.fixVersionPropagation.findFirst).mockResolvedValue(null);

      const resultWithoutProp = await previewBulk(
        { kind: "remove-fix-version", value: "1.5.0", dependencyScope: "recursive" },
        ["PROJ-100"],
        "user-1",
        { getTransitions: vi.fn() }
      );

      const depItem1 = resultWithoutProp.items.find((i) => i.jiraKey === "PROJ-101");
      expect(depItem1?.skipReason).toBe("manual_or_unpropagated");

      // Case B: Propagation record exists and not shared => safe to remove
      (vi.mocked(prisma.fixVersionPropagation.findFirst) as unknown as ReturnType<typeof vi.fn>).mockImplementation((args: { where?: { rootKey?: string } }) => {
        if (args?.where?.rootKey === "PROJ-100") {
          return Promise.resolve({ id: "prop-1", jiraVersionId: "v1" });
        }
        // otherProp check
        return Promise.resolve(null);
      });

      const resultWithProp = await previewBulk(
        { kind: "remove-fix-version", value: "1.5.0", dependencyScope: "recursive" },
        ["PROJ-100"],
        "user-1",
        { getTransitions: vi.fn() }
      );

      const depItem2 = resultWithProp.items.find((i) => i.jiraKey === "PROJ-101");
      expect(depItem2?.skipReason).toBeNull();
    });
  });

  describe("resolveFilterKeys with epics", () => {
    it("filters issues by epic key and none/unassigned", async () => {
      vi.mocked(prisma.issueCache.findMany).mockResolvedValue([
        { jiraKey: "EPM-1", raw: { parent: { key: "EPM-10", fields: { issuetype: { name: "Epic" } } } } },
        { jiraKey: "EPM-2", raw: { epic: { key: "EPM-20" } } },
        { jiraKey: "EPM-3", raw: {} },
      ] as never);

      const resEpic10 = await resolveFilterKeys("EPM", { epics: ["EPM-10"] });
      expect(resEpic10).toEqual(["EPM-1"]);

      const resNone = await resolveFilterKeys("EPM", { epics: ["none"] });
      expect(resNone).toEqual(["EPM-3"]);

      const resMultiple = await resolveFilterKeys("EPM", { epics: ["EPM-10", "EPM-20"] });
      expect(resMultiple).toEqual(["EPM-1", "EPM-2"]);
    });
  });

  describe("executeBulkOperation orchestration & completion notification", () => {
    it("aborts execution early when operation cannot be claimed", async () => {
      vi.mocked(prisma.bulkOperation.findUnique).mockResolvedValue(null);

      await executeBulkOperation("op-missing");

      expect(vi.mocked(processWithRetry)).not.toHaveBeenCalled();
    });

    it("runs pending items and delivers 'completed' notification on full success", async () => {
      const { notifyUser } = await import("@/lib/notify");

      // Claim phase
      vi.mocked(prisma.bulkOperation.findUnique)
        .mockResolvedValueOnce({
          id: "op-1",
          state: "queued",
          type: "update-fields",
          requestedBy: "user-1",
          total: 2,
          payload: { action: { kind: "update-fields", value: { points: 3 } }, params: {} },
          startedAt: null,
        } as never)
        // Finalize phase lookup
        .mockResolvedValueOnce({
          id: "op-1",
          state: "running",
          type: "update-fields",
          requestedBy: "user-1",
          total: 2,
          payload: {},
          startedAt: new Date(),
        } as never);

      vi.mocked(prisma.bulkOperation.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        jiraUserEnc: null,
        jiraTokenEnc: null,
        jiraAuth: null,
        bitbucketUserEnc: null,
        bitbucketTokenEnc: null,
      } as never);

      vi.mocked(prisma.bulkOperationItem.findMany).mockResolvedValue([
        { id: "item-1", jiraKey: "PROJ-1" },
        { id: "item-2", jiraKey: "PROJ-2" },
      ] as never);

      vi.mocked(processWithRetry).mockResolvedValue({ status: "succeeded" });

      vi.mocked(prisma.bulkOperationItem.groupBy).mockResolvedValue([
        { status: "succeeded", _count: { _all: 2 } },
      ] as never);
      vi.mocked(prisma.bulkOperation.update).mockResolvedValue({ id: "op-1" } as never);

      await executeBulkOperation("op-1");

      expect(vi.mocked(processWithRetry)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(notifyUser)).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          title: "Thao tác hàng loạt update-fields hoàn tất",
          severity: "info",
          eventKey: "bulk:op-1:completed",
          body: "2 thành công, 0 thất bại, 0 bỏ qua.",
        })
      );
    });

    it("delivers 'partially_failed' notification when some items fail (partial success)", async () => {
      const { notifyUser } = await import("@/lib/notify");

      vi.mocked(prisma.bulkOperation.findUnique)
        .mockResolvedValueOnce({
          id: "op-2",
          state: "queued",
          type: "transition",
          requestedBy: "user-2",
          total: 2,
          payload: { action: { kind: "transition", value: "Done" }, params: {} },
          startedAt: null,
        } as never)
        .mockResolvedValueOnce({
          id: "op-2",
          state: "running",
          type: "transition",
          requestedBy: "user-2",
          total: 2,
          payload: {},
          startedAt: new Date(),
        } as never);

      vi.mocked(prisma.bulkOperation.updateMany).mockResolvedValue({ count: 1 });
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      vi.mocked(prisma.bulkOperationItem.findMany).mockResolvedValue([
        { id: "item-1", jiraKey: "PROJ-1" },
        { id: "item-2", jiraKey: "PROJ-2" },
      ] as never);

      vi.mocked(processWithRetry)
        .mockResolvedValueOnce({ status: "succeeded" })
        .mockResolvedValueOnce({ status: "failed", error: "transition_unavailable", retryable: false });

      vi.mocked(prisma.bulkOperationItem.groupBy).mockResolvedValue([
        { status: "succeeded", _count: { _all: 1 } },
        { status: "failed", _count: { _all: 1 } },
      ] as never);
      vi.mocked(prisma.bulkOperation.update).mockResolvedValue({ id: "op-2" } as never);

      await executeBulkOperation("op-2");

      expect(vi.mocked(processWithRetry)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(notifyUser)).toHaveBeenCalledWith(
        "user-2",
        expect.objectContaining({
          title: "Thao tác hàng loạt transition thất bại một phần",
          severity: "warning",
          eventKey: "bulk:op-2:partially_failed",
          body: "1 thành công, 1 thất bại, 0 bỏ qua.",
        })
      );
    });
  });
});

