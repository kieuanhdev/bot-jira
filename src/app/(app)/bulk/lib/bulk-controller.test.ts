import { describe, expect, it } from "vitest";
import {
  computePreviewBasis,
  countPreviewBuckets,
  getConfirmLabel,
  pruneUnavailableFields,
  resolveInitialProject,
} from "./bulk-logic";
import type { BulkAction, Preview, PreviewItem, ProjectFieldOption } from "./bulk-types";
import { DEFAULT_BULK_FILTERS } from "@/lib/issues/issue-filters";

describe("bulk controller logic", () => {
  describe("computePreviewBasis", () => {
    const dummyAction: BulkAction = {
      kind: "update-fields",
      value: { labels: ["backend"] },
    };

    it("generates deterministic key-based basis with sorted keys", () => {
      const basis1 = computePreviewBasis({
        action: dummyAction,
        selectionMode: "pick",
        filterProject: "EPM",
        taskFilters: DEFAULT_BULK_FILTERS,
        selected: new Set(["EPM-3", "EPM-1", "EPM-2"]),
      });
      const basis2 = computePreviewBasis({
        action: dummyAction,
        selectionMode: "pick",
        filterProject: "EPM",
        taskFilters: DEFAULT_BULK_FILTERS,
        selected: new Set(["EPM-1", "EPM-2", "EPM-3"]),
      });
      expect(basis1).toBe(basis2);
      expect(JSON.parse(basis1)).toEqual({
        action: dummyAction,
        mode: "keys",
        keys: ["EPM-1", "EPM-2", "EPM-3"],
      });
    });

    it("generates filter-based basis in filter mode", () => {
      const filters = { ...DEFAULT_BULK_FILTERS, query: "search-term", statuses: ["In Progress"] };
      const basis = computePreviewBasis({
        action: dummyAction,
        selectionMode: "filter",
        filterProject: "CICM",
        taskFilters: filters,
        selected: new Set(["CICM-1"]),
      });
      expect(JSON.parse(basis)).toEqual({
        action: dummyAction,
        mode: "filter",
        project: "CICM",
        filters,
      });
    });

    it("differs when action changes", () => {
      const otherAction: BulkAction = {
        kind: "transition",
        value: "Done",
      };
      const basis1 = computePreviewBasis({
        action: dummyAction,
        selectionMode: "pick",
        filterProject: "EPM",
        taskFilters: DEFAULT_BULK_FILTERS,
        selected: new Set(["EPM-1"]),
      });
      const basis2 = computePreviewBasis({
        action: otherAction,
        selectionMode: "pick",
        filterProject: "EPM",
        taskFilters: DEFAULT_BULK_FILTERS,
        selected: new Set(["EPM-1"]),
      });
      expect(basis1).not.toBe(basis2);
    });
  });

  describe("pruneUnavailableFields", () => {
    it("returns unchanged set when field metadata is missing or all are available", () => {
      const enabled = new Set(["assignee", "labels"]);
      const res1 = pruneUnavailableFields(enabled, undefined);
      expect(res1.prunedFields).toBe(enabled);
      expect(res1.hasPrunedEstimate).toBe(false);
      expect(res1.hasPrunedPoints).toBe(false);

      const fields: ProjectFieldOption[] = [
        { id: "assignee", jiraFieldId: "assignee", name: "Assignee", available: true },
        { id: "labels", jiraFieldId: "labels", name: "Labels", available: true },
      ];
      const res2 = pruneUnavailableFields(enabled, fields);
      expect(res2.prunedFields).toBe(enabled);
      expect(res2.hasPrunedEstimate).toBe(false);
      expect(res2.hasPrunedPoints).toBe(false);
    });

    it("prunes unavailable fields and detects estimate/points removal", () => {
      const enabled = new Set(["assignee", "estimate", "points", "labels"]);
      const fields: ProjectFieldOption[] = [
        { id: "assignee", jiraFieldId: "assignee", name: "Assignee", available: true },
        { id: "labels", jiraFieldId: "labels", name: "Labels", available: true },
        { id: "estimate", jiraFieldId: "timeoriginalestimate", name: "Original Estimate", available: false },
        { id: "points", jiraFieldId: "customfield_10016", name: "Story Points", available: false },
      ];
      const res = pruneUnavailableFields(enabled, fields);
      expect(Array.from(res.prunedFields).sort()).toEqual(["assignee", "labels"]);
      expect(res.hasPrunedEstimate).toBe(true);
      expect(res.hasPrunedPoints).toBe(true);
    });
  });

  describe("resolveInitialProject", () => {
    it("prioritizes urlProject when provided", () => {
      const proj = resolveInitialProject({
        urlProject: "cicm",
        initialKeys: ["EPM-1"],
        projectKeys: ["EPM", "CICM"],
      });
      expect(proj).toBe("CICM");
    });

    it("infers project from first initialKey when urlProject is not given", () => {
      const proj = resolveInitialProject({
        urlProject: null,
        initialKeys: ["EPM-42", "EPM-43"],
        projectKeys: ["CICM", "EPM"],
      });
      expect(proj).toBe("EPM");
    });

    it("falls back to user preferred project matching project catalog", () => {
      const proj = resolveInitialProject({
        urlProject: null,
        initialKeys: [],
        preferredProjects: ["CICM", "MR"],
        availableProjects: ["EPM", "CICM", "MR"],
        projectKeys: ["EPM", "CICM", "MR"],
      });
      expect(proj).toBe("CICM");
    });

    it("falls back to first available project when no preferred match", () => {
      const proj = resolveInitialProject({
        urlProject: null,
        initialKeys: [],
        preferredProjects: ["UNKNOWN"],
        availableProjects: ["MR", "EPM"],
        projectKeys: ["EPM", "MR"],
      });
      expect(proj).toBe("MR");
    });

    it("falls back to project catalog head or empty string", () => {
      const proj = resolveInitialProject({
        urlProject: null,
        initialKeys: [],
        projectKeys: ["EPM"],
      });
      expect(proj).toBe("EPM");

      const empty = resolveInitialProject({
        urlProject: null,
        initialKeys: [],
        projectKeys: [],
      });
      expect(empty).toBe("");
    });
  });

  describe("countPreviewBuckets", () => {
    it("handles null preview gracefully", () => {
      expect(countPreviewBuckets(null)).toEqual({
        changes: 0,
        unchanged: 0,
        warnings: 0,
        blocked: 0,
      });
    });

    it("aggregates bucket counts across preview items", () => {
      const makeItem = (overrides: Partial<PreviewItem>): PreviewItem => ({
        jiraKey: "EPM-1",
        before: {},
        after: {},
        warning: null,
        skipReason: null,
        transitionName: null,
        branchName: null,
        targetField: null,
        targetVersionId: null,
        exists: true,
        ...overrides,
      });

      const samplePreview: Preview = {
        operationId: "op-1",
        type: "update-fields",
        total: 4,
        actionable: 2,
        skipped: 2,
        items: [
          makeItem({ jiraKey: "EPM-1", before: { labels: [] }, after: { labels: ["backend"] } }),
          makeItem({ jiraKey: "EPM-2", before: {}, after: {} }),
          makeItem({ jiraKey: "EPM-3", before: { status: "To Do" }, after: { status: "Done" }, warning: "stale_data" }),
          makeItem({ jiraKey: "EPM-4", before: {}, after: {}, skipReason: "parent_blocked" }),
        ],
      };

      const counts = countPreviewBuckets(samplePreview);
      expect(counts).toEqual({
        changes: 1,
        unchanged: 1,
        warnings: 1,
        blocked: 1,
      });
    });
  });

  describe("getConfirmLabel", () => {
    it("returns correct label for log-work", () => {
      const preview: Preview = {
        operationId: "op-1",
        total: 5,
        actionable: 3,
        skipped: 2,
        type: "log-work",
        items: [],
      };
      expect(
        getConfirmLabel({
          preview,
          isLogWorkOp: true,
          isTransitionOp: false,
          targetStatus: "",
        })
      ).toBe("Ghi worklog 3 task");
    });

    it("returns correct label for transition", () => {
      const preview: Preview = {
        operationId: "op-1",
        total: 5,
        actionable: 4,
        skipped: 1,
        type: "transition",
        items: [],
      };
      expect(
        getConfirmLabel({
          preview,
          isLogWorkOp: false,
          isTransitionOp: true,
          targetStatus: "In Progress",
        })
      ).toBe('Chuyển trạng thái 4 task sang "In Progress"');
    });

    it("returns correct label for field updates", () => {
      const preview: Preview = {
        operationId: "op-1",
        total: 5,
        actionable: 5,
        skipped: 0,
        type: "update-fields",
        items: [],
      };
      expect(
        getConfirmLabel({
          preview,
          isLogWorkOp: false,
          isTransitionOp: false,
          targetStatus: "",
        })
      ).toBe("Cập nhật 5 task");
    });

    it("returns default fallback when preview is null", () => {
      expect(
        getConfirmLabel({
          preview: null,
          isLogWorkOp: false,
          isTransitionOp: false,
          targetStatus: "",
        })
      ).toBe("Xác nhận thay đổi");
    });
  });

  describe("selection toggle operations", () => {
    it("toggles individual keys correctly in a set", () => {
      const selected = new Set(["EPM-1"]);
      function toggle(key: string, prev: Set<string>) {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }

      const s2 = toggle("EPM-2", selected);
      expect(Array.from(s2).sort()).toEqual(["EPM-1", "EPM-2"]);

      const s3 = toggle("EPM-1", s2);
      expect(Array.from(s3)).toEqual(["EPM-2"]);
    });

    it("toggles all keys correctly when not all are selected vs when all are selected", () => {
      const keys = ["EPM-1", "EPM-2", "EPM-3"];
      const partialSelected = new Set(["EPM-1"]);

      const allSelected = keys.every((k) => partialSelected.has(k));
      expect(allSelected).toBe(false);

      // toggleAll selects all
      const nextAll = new Set(partialSelected);
      keys.forEach((k) => nextAll.add(k));
      expect(Array.from(nextAll).sort()).toEqual(keys);

      // toggleAll deselects all when already all selected
      const isNowAll = keys.every((k) => nextAll.has(k));
      expect(isNowAll).toBe(true);
      const nextCleared = new Set(nextAll);
      keys.forEach((k) => nextCleared.delete(k));
      expect(Array.from(nextCleared)).toEqual([]);
    });
  });
});
