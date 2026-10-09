import { describe, it, expect } from "vitest";
import {
  mergeDefaultsWithRow,
  normalizeSummary,
  normalizeDescription,
  normalizeAssignee,
  normalizePriority,
  normalizeLabels,
  normalizePoints,
  normalizeEstimate,
  normalizeDueDate,
  normalizeFixVersions,
  normalizeComponents,
  normalizeParent,
} from "./create-normalization";
import type { BulkCreateProjectMetadata } from "./create-types";

describe("Bulk Create - Row Normalization and Field Sanitization", () => {
  const mockMeta: BulkCreateProjectMetadata = {
    project: { key: "DEMO", name: "Demo" },
    canCreate: true,
    issueTypes: [],
    fieldsByIssueType: {},
    priorityOptions: [
      { id: "1", name: "High" },
      { id: "2", name: "Low" },
    ],
    versionOptions: [
      { id: "v1", name: "1.0", archived: false },
      { id: "v0", name: "0.9", archived: true },
    ],
    components: [
      { id: "c1", name: "Backend" },
    ],
    pointsFieldId: "customfield_10001",
    supportsTimeTracking: true,
    supportsDueDate: true,
    hasSubtaskTypes: true,
    defaultIssueTypeId: "1",
    defaultSubtaskTypeId: null,
    allowsUnassigned: true,
    fieldCapabilities: {
      priority: { available: true },
      fixVersions: { available: true },
      points: { available: true },
    },
    fetchedAt: new Date().toISOString(),
    fingerprint: "sha256:abc",
  };

  describe("mergeDefaultsWithRow", () => {
    it("preserves row values when no defaults provided", () => {
      const row = { clientRef: "row-1", summary: "My Task" };
      expect(mergeDefaultsWithRow(row, undefined)).toEqual(row);
    });

    it("inherits missing fields from defaults", () => {
      const merged = mergeDefaultsWithRow(
        { clientRef: "row-1", summary: "My Task" },
        { priorityId: "1", description: "Default desc", points: 3 }
      );
      expect(merged.priorityId).toBe("1");
      expect(merged.description).toBe("Default desc");
      expect(merged.points).toBe(3);
    });

    it("overrides defaults with row values", () => {
      const merged = mergeDefaultsWithRow(
        { clientRef: "row-1", summary: "My Task", priorityId: "2", points: 8 },
        { priorityId: "1", points: 3 }
      );
      expect(merged.priorityId).toBe("2");
      expect(merged.points).toBe(8);
    });

    it("replaces default arrays completely when item specifies an array", () => {
      const merged = mergeDefaultsWithRow(
        { clientRef: "row-1", summary: "My Task", labels: ["custom"] },
        { labels: ["default-1", "default-2"] }
      );
      expect(merged.labels).toEqual(["custom"]);
    });
  });

  describe("normalizeSummary", () => {
    it("reports error on empty summary", () => {
      expect(normalizeSummary("").error?.code).toBe("SUMMARY_REQUIRED");
      expect(normalizeSummary("   ").error?.code).toBe("SUMMARY_REQUIRED");
      expect(normalizeSummary(null).error?.code).toBe("SUMMARY_REQUIRED");
    });

    it("reports error on overly long summary", () => {
      const longStr = "A".repeat(256);
      const res = normalizeSummary(longStr);
      expect(res.error?.code).toBe("SUMMARY_TOO_LONG");
    });

    it("returns trimmed summary on valid input", () => {
      const res = normalizeSummary("  Implement feature X  ");
      expect(res.error).toBeUndefined();
      expect(res.summary).toBe("Implement feature X");
    });
  });

  describe("normalizeDescription", () => {
    it("returns empty object for undefined or empty string", () => {
      expect(normalizeDescription(undefined)).toEqual({});
      expect(normalizeDescription(null)).toEqual({});
      expect(normalizeDescription("   ")).toEqual({});
    });

    it("reports error when description exceeds limit", () => {
      const tooLong = "D".repeat(32769);
      const res = normalizeDescription(tooLong);
      expect(res.error?.code).toBe("DESCRIPTION_TOO_LONG");
    });

    it("returns description for valid string", () => {
      const res = normalizeDescription("A detailed task description");
      expect(res.error).toBeUndefined();
      expect(res.description).toBe("A detailed task description");
    });
  });

  describe("normalizeAssignee", () => {
    it("trims and returns string or null", () => {
      expect(normalizeAssignee("  alice  ")).toBe("alice");
      expect(normalizeAssignee("")).toBeNull();
      expect(normalizeAssignee(null)).toBeNull();
      expect(normalizeAssignee(undefined)).toBeNull();
    });
  });

  describe("normalizePriority", () => {
    it("handles absent priority", () => {
      expect(normalizePriority(undefined, mockMeta)).toEqual({});
      expect(normalizePriority("", mockMeta)).toEqual({});
    });

    it("matches priority by id or name", () => {
      expect(normalizePriority("1", mockMeta)).toEqual({ priorityId: "1" });
      expect(normalizePriority("high", mockMeta)).toEqual({ priorityId: "1" });
      expect(normalizePriority("2", mockMeta)).toEqual({ priorityId: "2" });
    });

    it("reports error when priority does not match allowed values", () => {
      const res = normalizePriority("Urgent", mockMeta);
      expect(res.error?.code).toBe("FIELD_VALUE_NOT_ALLOWED");
    });

    it("allows any string if metadata has no priority options", () => {
      const emptyMeta = { ...mockMeta, priorityOptions: [] };
      const res = normalizePriority("CustomPriority", emptyMeta);
      expect(res.priorityId).toBe("CustomPriority");
      expect(res.error).toBeUndefined();
    });
  });

  describe("normalizeLabels", () => {
    it("replaces whitespace with hyphens and dedupes", () => {
      const res = normalizeLabels(["tag one", "tag  two", "tag one"]);
      expect(res.labels).toEqual(["tag-one", "tag-two"]);
      expect(res.warnings).toHaveLength(0);
    });

    it("warns and truncates labels that exceed maximum length", () => {
      const longLabel = "l".repeat(60);
      const res = normalizeLabels([longLabel]);
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0].code).toBe("LABEL_TOO_LONG");
      expect(res.labels[0]).toHaveLength(50);
    });

    it("warns and limits total label count", () => {
      const manyLabels = Array.from({ length: 25 }, (_, i) => `label-${i}`);
      const res = normalizeLabels(manyLabels);
      expect(res.labels).toHaveLength(20);
      expect(res.warnings.some((w) => w.code === "TOO_MANY_LABELS")).toBe(true);
    });
  });

  describe("normalizePoints", () => {
    it("handles absent points", () => {
      expect(normalizePoints(undefined, mockMeta)).toEqual({});
      expect(normalizePoints(null, mockMeta)).toEqual({});
      expect(normalizePoints("", mockMeta)).toEqual({});
    });

    it("rejects negative, floating point, or non-finite numbers", () => {
      expect(normalizePoints(-1, mockMeta).error?.code).toBe("INVALID_POINTS");
      expect(normalizePoints(3.5, mockMeta).error?.code).toBe("INVALID_POINTS");
      expect(normalizePoints("not-a-number", mockMeta).error?.code).toBe("INVALID_POINTS");
    });

    it("warns if project does not support story points", () => {
      const noPointsMeta = { ...mockMeta, pointsFieldId: null };
      const res = normalizePoints(5, noPointsMeta);
      expect(res.points).toBe(5);
      expect(res.warning?.code).toBe("POINTS_FIELD_UNAVAILABLE");
    });

    it("accepts valid non-negative integer points", () => {
      const res = normalizePoints(8, mockMeta);
      expect(res.points).toBe(8);
      expect(res.error).toBeUndefined();
      expect(res.warning).toBeUndefined();
    });
  });

  describe("normalizeEstimate", () => {
    it("handles absent estimate", () => {
      expect(normalizeEstimate(undefined, mockMeta)).toEqual({});
      expect(normalizeEstimate("", mockMeta)).toEqual({});
    });

    it("rejects invalid duration format", () => {
      const res = normalizeEstimate("invalid-time", mockMeta);
      expect(res.error?.code).toBe("INVALID_ESTIMATE");
    });

    it("parses valid estimate into duration seconds", () => {
      const res = normalizeEstimate("2h 30m", mockMeta);
      expect(res.originalEstimate).toBe("2h 30m");
      expect(res.originalEstimateSeconds).toBe(2 * 3600 + 30 * 60);
      expect(res.error).toBeUndefined();
    });

    it("warns when time tracking is unavailable in project", () => {
      const noTTMeta = { ...mockMeta, supportsTimeTracking: false };
      const res = normalizeEstimate("1d", noTTMeta);
      expect(res.warning?.code).toBe("TIMETRACKING_UNAVAILABLE");
    });
  });

  describe("normalizeDueDate", () => {
    it("handles absent due date", () => {
      expect(normalizeDueDate(undefined)).toEqual({});
      expect(normalizeDueDate("")).toEqual({});
    });

    it("rejects non-ISO or non-existent date", () => {
      expect(normalizeDueDate("2026/10/09").error?.code).toBe("INVALID_DUEDATE");
      expect(normalizeDueDate("2026-02-31").error?.code).toBe("INVALID_DUEDATE");
    });

    it("accepts valid ISO date", () => {
      expect(normalizeDueDate("2026-10-15")).toEqual({ dueDate: "2026-10-15" });
    });
  });

  describe("normalizeFixVersions", () => {
    it("resolves versions by id or name and flags archived", () => {
      const valid = normalizeFixVersions(["v1"], mockMeta);
      expect(valid.errors).toHaveLength(0);
      expect(valid.fixVersionIds).toEqual(["v1"]);

      const byName = normalizeFixVersions(["1.0"], mockMeta);
      expect(byName.errors).toHaveLength(0);
      expect(byName.fixVersionIds).toEqual(["v1"]);

      const archived = normalizeFixVersions(["0.9"], mockMeta);
      expect(archived.errors[0].code).toBe("VERSION_ARCHIVED");

      const notFound = normalizeFixVersions(["9.9"], mockMeta);
      expect(notFound.errors[0].code).toBe("VERSION_NOT_FOUND");
    });
  });

  describe("normalizeComponents", () => {
    it("resolves components by id or name and flags unknown", () => {
      const valid = normalizeComponents(["Backend"], mockMeta);
      expect(valid.errors).toHaveLength(0);
      expect(valid.componentIds).toEqual(["c1"]);

      const unknown = normalizeComponents(["Frontend"], mockMeta);
      expect(unknown.errors[0].code).toBe("COMPONENT_NOT_FOUND");
    });
  });

  describe("normalizeParent", () => {
    it("handles batch parent validation", () => {
      const emptyRef = normalizeParent({ type: "batch", clientRef: "" }, "row-1");
      expect(emptyRef.errors[0].code).toBe("PARENT_REQUIRED");

      const cycleRef = normalizeParent({ type: "batch", clientRef: "row-1" }, "row-1");
      expect(cycleRef.errors[0].code).toBe("PARENT_CYCLE");

      const valid = normalizeParent({ type: "batch", clientRef: "row-2" }, "row-1");
      expect(valid.errors).toHaveLength(0);
      expect(valid.parent).toEqual({ type: "batch", clientRef: "row-2" });
    });

    it("handles jira parent validation", () => {
      const emptyKey = normalizeParent({ type: "jira", jiraKey: "" }, "row-1");
      expect(emptyKey.errors[0].code).toBe("PARENT_REQUIRED");

      const invalidKey = normalizeParent({ type: "jira", jiraKey: "invalid_key" }, "row-1");
      expect(invalidKey.errors[0].code).toBe("PARENT_NOT_FOUND");

      const valid = normalizeParent({ type: "jira", jiraKey: "DEMO-123" }, "row-1");
      expect(valid.errors).toHaveLength(0);
      expect(valid.parent).toEqual({ type: "jira", jiraKey: "DEMO-123" });
    });
  });
});
