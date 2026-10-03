import { describe, it, expect } from "vitest";
import {
  validateBulkCreateBatch,
  mergeDefaultsWithRow,
  validateAndNormalizeItem,
  generateBulkCreateMarker,
} from "./create-validator";
import { parseBulkCreateCsv } from "./csv-parser";
import type { BulkCreateProjectMetadata } from "./create-types";

describe("Bulk Create - CSV and TSV Parser", () => {
  it("parses simple CSV correctly", () => {
    const csv = `summary,issueType,description,priority\nTask 1,Task,Desc 1,High\nTask 2,Bug,Desc 2,Medium`;
    const res = parseBulkCreateCsv(csv);
    expect(res.items.length).toBe(2);
    expect(res.items[0].summary).toBe("Task 1");
    expect(res.items[0].issueTypeId).toBe("Task");
    expect(res.items[0].description).toBe("Desc 1");
    expect(res.items[0].priorityId).toBe("High");
    expect(res.items[0].clientRef).toBe("row-1");
  });

  it("handles commas inside quotes and escaped quotes", () => {
    const csv = `summary,description\n"Hello, world","Line with ""quotes"" inside"`;
    const res = parseBulkCreateCsv(csv);
    expect(res.items.length).toBe(1);
    expect(res.items[0].summary).toBe("Hello, world");
    expect(res.items[0].description).toBe('Line with "quotes" inside');
  });

  it("handles TSV (tab separated) and Excel copy paste", () => {
    const tsv = `summary\tlabels\tpoints\nAPI Design\tbackend,api\t5`;
    const res = parseBulkCreateCsv(tsv);
    expect(res.items.length).toBe(1);
    expect(res.items[0].summary).toBe("API Design");
    expect(res.items[0].labels).toEqual(["backend", "api"]);
    expect(res.items[0].points).toBe(5);
  });

  it("handles UTF-8 BOM", () => {
    const csvWithBom = `\uFEFFsummary,issueType\nTask BOM,Task`;
    const res = parseBulkCreateCsv(csvWithBom);
    expect(res.items.length).toBe(1);
    expect(res.items[0].summary).toBe("Task BOM");
  });
});

describe("Bulk Create - Validator and Normalizer", () => {
  const mockMeta: BulkCreateProjectMetadata = {
    project: { key: "EPM", name: "Enterprise Project" },
    canCreate: true,
    issueTypes: [
      { id: "10001", name: "Task", subtask: false },
      { id: "10002", name: "Bug", subtask: false },
      { id: "10003", name: "Sub-task", subtask: true },
      { id: "10004", name: "Epic", subtask: false },
    ],
    fieldsByIssueType: {
      "10001": [
        { id: "summary", name: "Summary", required: true },
        { id: "issuetype", name: "Issue Type", required: true },
      ],
      "10002": [
        { id: "summary", name: "Summary", required: true },
        { id: "issuetype", name: "Issue Type", required: true },
        { id: "description", name: "Description", required: true },
      ],
    },
    priorityOptions: [
      { id: "1", name: "Highest" },
      { id: "2", name: "High" },
      { id: "3", name: "Medium" },
    ],
    versionOptions: [
      { id: "20001", name: "v1.0", archived: false },
      { id: "20002", name: "v0.9", archived: true },
    ],
    components: [
      { id: "c1", name: "Backend" },
      { id: "c2", name: "Frontend" },
    ],
    pointsFieldId: "customfield_10004",
    supportsTimeTracking: true,
    supportsDueDate: true,
    hasSubtaskTypes: true,
    defaultIssueTypeId: "10001",
    defaultSubtaskTypeId: "10003",
    allowsUnassigned: true,
    fieldCapabilities: {
      priority: { available: true },
      fixVersions: { available: true },
      points: { available: true },
    },
    fetchedAt: new Date().toISOString(),
    fingerprint: "sha256:test",
  };

  it("validates batch level constraints", () => {
    expect(validateBulkCreateBatch(null).ok).toBe(false);
    expect(validateBulkCreateBatch({ projectKey: "", items: [] }).ok).toBe(false);
    expect(validateBulkCreateBatch({ projectKey: "123-INVALID", items: [{ summary: "A" }] }).ok).toBe(false);

    // duplicate clientRef
    const dupRef = validateBulkCreateBatch({
      projectKey: "EPM",
      items: [
        { clientRef: "row-1", summary: "Task 1" },
        { clientRef: "row-1", summary: "Task 2" },
      ],
    });
    expect(dupRef.ok).toBe(false);

    // valid batch
    const valid = validateBulkCreateBatch({
      projectKey: "EPM",
      items: [{ summary: "Task 1" }, { summary: "Task 2" }],
    });
    expect(valid.ok).toBe(true);
  });

  it("merges defaults with row overrides correctly", () => {
    const merged = mergeDefaultsWithRow(
      {
        clientRef: "row-1",
        summary: "Overridden",
        priorityId: "1",
        labels: ["custom"],
        parent: { type: "jira", jiraKey: "EPM-10" },
      },
      {
        issueTypeId: "10001",
        priorityId: "3",
        labels: ["default-label"],
        points: 5,
      }
    );

    expect(merged.summary).toBe("Overridden");
    expect(merged.issueTypeId).toBe("10001");
    expect(merged.priorityId).toBe("1"); // overridden
    expect(merged.labels).toEqual(["custom"]); // replaced, not concatenated
    expect(merged.points).toBe(5); // inherited
    expect(merged.parent).toEqual({ type: "jira", jiraKey: "EPM-10" });
  });

  it("validates item and marks ready when valid", () => {
    const res = validateAndNormalizeItem(
      { clientRef: "row-1", summary: "Clean task", issueTypeId: "Task" },
      0,
      undefined,
      mockMeta
    );
    expect(res.classification).toBe("ready");
    expect(res.errors.length).toBe(0);
    expect(res.normalizedFields.issueTypeId).toBe("10001"); // resolved name to id
  });

  it("blocks item if sub-task has no parent", () => {
    const res = validateAndNormalizeItem(
      { clientRef: "row-1", summary: "Subtask item", issueTypeId: "Sub-task" },
      0,
      undefined,
      mockMeta
    );
    expect(res.classification).toBe("blocked");
    expect(res.errors.some((e) => e.code === "PARENT_REQUIRED")).toBe(true);
  });

  it("keeps a selected parent when defaults are present", () => {
    const res = validateAndNormalizeItem(
      {
        clientRef: "row-1",
        summary: "Subtask with parent",
        issueTypeId: "Sub-task",
        parent: { type: "jira", jiraKey: "EPM-10" },
      },
      0,
      {},
      mockMeta
    );
    expect(res.classification).toBe("ready");
    expect(res.errors.some((e) => e.code === "PARENT_REQUIRED")).toBe(false);
    expect(res.normalizedFields.parent).toEqual({ type: "jira", jiraKey: "EPM-10" });
  });

  it("blocks item if required field is missing", () => {
    // IssueType "10002" (Bug) requires description
    const res = validateAndNormalizeItem(
      { clientRef: "row-1", summary: "Bug without description", issueTypeId: "10002" },
      0,
      undefined,
      mockMeta
    );
    expect(res.classification).toBe("blocked");
    expect(res.errors.some((e) => e.code === "REQUIRED_FIELD_MISSING")).toBe(true);
  });

  it("blocks item if archived version is chosen", () => {
    const res = validateAndNormalizeItem(
      { clientRef: "row-1", summary: "Task with old version", issueTypeId: "10001", fixVersionIds: ["v0.9"] },
      0,
      undefined,
      mockMeta
    );
    expect(res.classification).toBe("blocked");
    expect(res.errors.some((e) => e.code === "VERSION_ARCHIVED")).toBe(true);
  });

  it("validates components against project metadata", () => {
    // Valid by ID and by Name
    const validRes = validateAndNormalizeItem(
      {
        clientRef: "row-1",
        summary: "Task with components",
        issueTypeId: "10001",
        componentIds: ["c1", "Frontend"],
      },
      0,
      undefined,
      mockMeta
    );
    expect(validRes.classification).toBe("ready");
    expect(validRes.normalizedFields.componentIds).toEqual(["c1", "c2"]);

    // Invalid component
    const invalidRes = validateAndNormalizeItem(
      {
        clientRef: "row-2",
        summary: "Task with invalid component",
        issueTypeId: "10001",
        componentIds: ["NonExistent"],
      },
      1,
      undefined,
      mockMeta
    );
    expect(invalidRes.classification).toBe("blocked");
    expect(invalidRes.errors.some((e) => e.code === "COMPONENT_NOT_FOUND")).toBe(true);
  });

  it("allows standard task (Task / Story) to link to parent / Epic", () => {
    const res = validateAndNormalizeItem(
      {
        clientRef: "row-1",
        summary: "Standard task linking to Epic",
        issueTypeId: "10001",
        parent: { type: "jira", jiraKey: "EPM-50" },
      },
      0,
      undefined,
      mockMeta
    );
    expect(res.classification).toBe("ready");
    expect(res.errors.length).toBe(0);
    expect(res.normalizedFields.parent).toEqual({ type: "jira", jiraKey: "EPM-50" });
  });

  it("blocks Epic from having a parent", () => {
    const res = validateAndNormalizeItem(
      {
        clientRef: "row-1",
        summary: "Epic with parent",
        issueTypeId: "10004",
        parent: { type: "jira", jiraKey: "EPM-50" },
      },
      0,
      undefined,
      mockMeta
    );
    expect(res.classification).toBe("blocked");
    expect(res.errors.some((e) => e.code === "PARENT_NOT_ALLOWED")).toBe(true);
  });

  it("generates stable idempotency marker", () => {
    const marker = generateBulkCreateMarker("cuid12345678", 5);
    expect(marker).toBe("ttw-bulk-12345678-5");
  });
});
