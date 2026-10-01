import { describe, expect, it } from "vitest";
import {
  normalizeExcelHeader,
  extractIdFromDropdownValue,
  getActiveColumnsForProject,
  EXCEL_SCHEMA_VERSION,
} from "./excel-schema";
import { type BulkCreateProjectMetadata } from "./create-types";

describe("excel-schema", () => {
  const mockMetadata: BulkCreateProjectMetadata = {
    project: { key: "EPM", name: "Engineering Project" },
    canCreate: true,
    issueTypes: [
      { id: "10001", name: "Task", subtask: false },
      { id: "10002", name: "Sub-task", subtask: true },
    ],
    fieldsByIssueType: {},
    priorityOptions: [{ id: "3", name: "High" }],
    versionOptions: [{ id: "10420", name: "v1.0" }],
    pointsFieldId: "customfield_10020",
    supportsTimeTracking: true,
    supportsDueDate: true,
    hasSubtaskTypes: true,
    defaultIssueTypeId: "10001",
    defaultSubtaskTypeId: "10002",
    allowsUnassigned: true,
    fieldCapabilities: {
      priority: { available: true },
      fixVersions: { available: true },
      points: { available: true },
    },
    fetchedAt: new Date().toISOString(),
    fingerprint: "sha256:abc12345",
  };

  it("normalizes headers with aliases, case-insensitivity, and trailing asterisks", () => {
    expect(normalizeExcelHeader("Summary *")).toBe("summary");
    expect(normalizeExcelHeader("Tiêu đề")).toBe("summary");
    expect(normalizeExcelHeader("summary")).toBe("summary");
    expect(normalizeExcelHeader("Client Ref *")).toBe("clientRef");
    expect(normalizeExcelHeader("Mã tham chiếu")).toBe("clientRef");
    expect(normalizeExcelHeader("Issue Type *")).toBe("issueTypeId");
    expect(normalizeExcelHeader("Loại task")).toBe("issueTypeId");
    expect(normalizeExcelHeader("Parent Ref")).toBe("parentRef");
    expect(normalizeExcelHeader("Task cha")).toBe("parentRef");
    expect(normalizeExcelHeader("Parent Jira Key")).toBe("parentKey");
    expect(normalizeExcelHeader("Story Points")).toBe("points");
    expect(normalizeExcelHeader("Original Estimate")).toBe("originalEstimate");
    expect(normalizeExcelHeader("Due Date")).toBe("dueDate");
    expect(normalizeExcelHeader("Fix Versions")).toBe("fixVersionIds");
    expect(normalizeExcelHeader("Non-existent column")).toBeNull();
  });

  it("extracts ID from formatted dropdown values: Name [ID]", () => {
    expect(extractIdFromDropdownValue("Task [10001]")).toEqual({
      name: "Task",
      id: "10001",
    });
    expect(extractIdFromDropdownValue("Nguyễn Văn A [nguyenvana]")).toEqual({
      name: "Nguyễn Văn A",
      id: "nguyenvana",
    });
    expect(extractIdFromDropdownValue("High [3]")).toEqual({
      name: "High",
      id: "3",
    });
    expect(extractIdFromDropdownValue("Plain Name")).toEqual({
      name: "Plain Name",
      id: null,
    });
  });

  it("filters active columns based on project metadata capabilities", () => {
    const allCols = getActiveColumnsForProject(mockMetadata);
    expect(allCols.some((c) => c.key === "priorityId")).toBe(true);
    expect(allCols.some((c) => c.key === "points")).toBe(true);
    expect(allCols.some((c) => c.key === "fixVersionIds")).toBe(true);

    const limitedMetadata: BulkCreateProjectMetadata = {
      ...mockMetadata,
      priorityOptions: [],
      versionOptions: [],
      pointsFieldId: null,
      supportsTimeTracking: false,
      supportsDueDate: false,
    };
    const limitedCols = getActiveColumnsForProject(limitedMetadata);
    expect(limitedCols.some((c) => c.key === "priorityId")).toBe(false);
    expect(limitedCols.some((c) => c.key === "points")).toBe(false);
    expect(limitedCols.some((c) => c.key === "fixVersionIds")).toBe(false);
    expect(limitedCols.some((c) => c.key === "originalEstimate")).toBe(false);
    expect(limitedCols.some((c) => c.key === "dueDate")).toBe(false);
    expect(limitedCols.some((c) => c.key === "summary")).toBe(true);
    expect(limitedCols.some((c) => c.key === "clientRef")).toBe(true);
  });
});
