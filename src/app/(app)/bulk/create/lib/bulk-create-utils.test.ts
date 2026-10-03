import { describe, it, expect } from "vitest";
import { parsePastedSpreadsheet } from "./paste-matrix";
import { validateRow, validateAllRows } from "./client-validation";
import { type BulkCreateProjectMetadata, type BulkCreateRowInput } from "@/lib/bulk/create-types";

const mockMetadata: BulkCreateProjectMetadata = {
  project: {
    key: "EPM",
    name: "Enterprise Project",
  },
  canCreate: true,
  fetchedAt: new Date().toISOString(),
  fingerprint: "fp-test",
  hasSubtaskTypes: true,
  defaultIssueTypeId: "10001",
  defaultSubtaskTypeId: "10003",
  allowsUnassigned: true,
  fieldCapabilities: {
    priority: { available: true },
    fixVersions: { available: true },
    points: { available: true },
  },
  pointsFieldId: "customfield_10002",
  supportsTimeTracking: true,
  supportsDueDate: true,
  issueTypes: [
    { id: "10001", name: "Task", subtask: false },
    { id: "10002", name: "Bug", subtask: false },
    { id: "10003", name: "Sub-task", subtask: true },
  ],
  priorityOptions: [
    { id: "1", name: "Highest" },
    { id: "2", name: "High" },
    { id: "3", name: "Medium" },
    { id: "4", name: "Low" },
  ],
  versionOptions: [
    { id: "20001", name: "v1.0.0", archived: false, released: false },
  ],
  components: [
    { id: "c1", name: "FE" },
  ],
  fieldsByIssueType: {},
};

describe("Bulk Create - Spreadsheet Paste Matrix", () => {
  it("ignores single line single cell paste", () => {
    const res = parsePastedSpreadsheet("Just a single summary", 0, [{ clientRef: "r1", summary: "" }], mockMetadata);
    expect(res).toBeNull();
  });

  it("splits multiline plain text into multiple task summaries", () => {
    const text = "Task One\nTask Two\nTask Three";
    const initialItems: BulkCreateRowInput[] = [{ clientRef: "r1", summary: "" }];
    const res = parsePastedSpreadsheet(text, 0, initialItems, mockMetadata);

    expect(res).not.toBeNull();
    expect(res!.appliedCount).toBe(3);
    expect(res!.items).toHaveLength(3);
    expect(res!.items[0].summary).toBe("Task One");
    expect(res!.items[1].summary).toBe("Task Two");
    expect(res!.items[2].summary).toBe("Task Three");
    expect(res!.items[1].clientRef).toBeDefined();
  });

  it("parses TSV matrix with Type and Priority matches", () => {
    const tsv = "Fix login crash\tBug\tHighest\tuser123\nRefactor DB\tTask\tHigh";
    const initialItems: BulkCreateRowInput[] = [{ clientRef: "r1", summary: "" }];
    const res = parsePastedSpreadsheet(tsv, 0, initialItems, mockMetadata);

    expect(res).not.toBeNull();
    expect(res!.appliedCount).toBe(2);
    expect(res!.items[0].summary).toBe("Fix login crash");
    expect(res!.items[0].issueTypeId).toBe("10002"); // Bug
    expect(res!.items[0].priorityId).toBe("1"); // Highest
    expect(res!.items[0].assignee).toBe("user123");

    expect(res!.items[1].summary).toBe("Refactor DB");
    expect(res!.items[1].issueTypeId).toBe("10001"); // Task
    expect(res!.items[1].priorityId).toBe("2"); // High
  });
});

describe("Bulk Create - Client Validation", () => {
  it("validates summary required and subtask parent required", () => {
    const row1: BulkCreateRowInput = { clientRef: "r1", summary: "" };
    const res1 = validateRow(row1, 0, {}, mockMetadata);
    expect(res1.isValid).toBe(false);
    expect(res1.errors.some((e) => e.field === "summary")).toBe(true);

    const subtaskRow: BulkCreateRowInput = {
      clientRef: "r2",
      summary: "My Subtask",
      issueTypeId: "10003", // Sub-task
    };
    const res2 = validateRow(subtaskRow, 1, {}, mockMetadata);
    expect(res2.isValid).toBe(false);
    expect(res2.errors.some((e) => e.field === "parent")).toBe(true);

    // With parent, valid
    const validSubtask: BulkCreateRowInput = {
      ...subtaskRow,
      parent: { type: "jira", jiraKey: "EPM-10" },
    };
    const res3 = validateRow(validSubtask, 1, {}, mockMetadata);
    expect(res3.isValid).toBe(true);
  });

  it("flags negative points and invalid estimate format warnings", () => {
    const row: BulkCreateRowInput = {
      clientRef: "r1",
      summary: "Valid summary",
      points: -5,
      originalEstimate: "invalid time string",
    };
    const res = validateRow(row, 0, {}, mockMetadata);
    expect(res.errors.some((e) => e.field === "points")).toBe(true);
    expect(res.warnings.some((w) => w.field === "originalEstimate")).toBe(true);
  });

  it("summarizes errors across all rows", () => {
    const items: BulkCreateRowInput[] = [
      { clientRef: "r1", summary: "Task 1" },
      { clientRef: "r2", summary: "" },
    ];
    const summary = validateAllRows(items, {}, mockMetadata);
    expect(summary.totalErrors).toBe(1);
    expect(summary.firstErrorRowIndex).toBe(1);
    expect(summary.validRowCount).toBe(1);
  });
});

import { getDefaultVisibleColumnIds, getAvailableToggleableColumns } from "./column-definitions";

describe("Bulk Create - Column Definitions", () => {
  it("computes default visible columns based on metadata capabilities", () => {
    const defaultCols = getDefaultVisibleColumnIds(mockMetadata);
    expect(defaultCols).toContain("summary");
    expect(defaultCols).toContain("issueType");
    expect(defaultCols).toContain("parent");
    expect(defaultCols).toContain("components");
    expect(defaultCols).toContain("points");
    expect(defaultCols).toContain("originalEstimate");
    expect(defaultCols).toContain("dueDate");
    // fixVersion default is false
    expect(defaultCols).not.toContain("fixVersion");
  });

  it("filters toggleable columns", () => {
    const toggleables = getAvailableToggleableColumns(mockMetadata);
    expect(toggleables.some((c) => c.id === "summary")).toBe(false); // cannot toggle summary
    expect(toggleables.some((c) => c.id === "priority")).toBe(true);
    expect(toggleables.some((c) => c.id === "assignee")).toBe(true);
    expect(toggleables.some((c) => c.id === "components")).toBe(true);
    expect(toggleables.some((c) => c.id === "description")).toBe(true);
  });
});

