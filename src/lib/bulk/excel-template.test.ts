import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { generateBulkCreateExcelTemplate } from "./excel-template";
import { type BulkCreateProjectMetadata } from "./create-types";
import {
  SHEET_NAME_TASKS,
  SHEET_NAME_CATALOG,
  SHEET_NAME_GUIDE,
  SHEET_NAME_EXAMPLES,
} from "./excel-schema";

describe("excel-template", () => {
  const mockMetadata: BulkCreateProjectMetadata = {
    project: { key: "TESTPROJ", name: "Test Project", id: "100" },
    canCreate: true,
    issueTypes: [
      { id: "10001", name: "Task", subtask: false },
      { id: "10002", name: "Sub-task", subtask: true },
    ],
    fieldsByIssueType: {},
    priorityOptions: [
      { id: "1", name: "Blocker" },
      { id: "3", name: "Major" },
    ],
    versionOptions: [{ id: "101", name: "v1.0.0" }],
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
    fingerprint: "sha256:fedcba9876543210",
  };

  const mockAssignees = [
    { username: "dev1", displayName: "Developer One" },
    { username: "dev2", displayName: "Developer Two" },
  ];

  it("generates a valid workbook buffer containing Tasks, Danh_muc and Huong_dan sheets", async () => {
    const buffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata,
      assignees: mockAssignees,
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    // 1. Verify sheets exist
    const tasksSheet = workbook.getWorksheet(SHEET_NAME_TASKS);
    const catalogSheet = workbook.getWorksheet(SHEET_NAME_CATALOG);
    const guideSheet = workbook.getWorksheet(SHEET_NAME_GUIDE);
    const examplesSheet = workbook.getWorksheet(SHEET_NAME_EXAMPLES);

    expect(tasksSheet).toBeDefined();
    expect(catalogSheet).toBeDefined();
    expect(guideSheet).toBeDefined();
    expect(examplesSheet).toBeDefined();

    // 2. Verify sheet properties
    expect(catalogSheet?.state).toBe("hidden");

    // 3. Verify Tasks sheet structure
    const frozenView = tasksSheet?.views?.[0] as { state?: string; ySplit?: number } | undefined;
    expect(frozenView?.state).toBe("frozen");
    expect(frozenView?.ySplit).toBe(1);

    const headerRow = tasksSheet?.getRow(1);
    expect(headerRow?.getCell(1).text).toContain("Client Ref");
    expect(headerRow?.getCell(2).text).toContain("Summary");

    // 4. Verify 100 pre-populated rows with TASK-xxx clientRef
    expect(tasksSheet?.rowCount).toBeGreaterThanOrEqual(101);
    expect(tasksSheet?.getRow(2).getCell(1).text).toBe("TASK-001");
    expect(tasksSheet?.getRow(101).getCell(1).text).toBe("TASK-100");

    // Named ranges keep cross-sheet dropdowns compatible with desktop Excel.
    expect(tasksSheet?.getRow(2).getCell(3).dataValidation.formulae).toEqual(["IssueTypes"]);
    expect(tasksSheet?.getRow(2).getCell(4).dataValidation.formulae).toEqual(["TaskClientRefs"]);
    expect(tasksSheet?.getRow(2).getCell(12).dataValidation.type).toBe("date");
    expect(examplesSheet?.getCell("A1").text).toContain("VÍ DỤ THAM KHẢO");

    // 5. Verify catalog content
    expect(catalogSheet?.getCell("A2").text).toBe("Task [10001]");
    expect(catalogSheet?.getCell("A3").text).toBe("Sub-task [10002]");
    expect(catalogSheet?.getCell("B2").text).toBe("Blocker [1]");
    expect(catalogSheet?.getCell("C2").text).toBe("Developer One [dev1]");
    expect(catalogSheet?.getCell("D2").text).toBe("v1.0.0 [101]");

    // 6. Verify manifest in catalog sheet
    const manifestText = catalogSheet?.getCell("Z1").text;
    expect(manifestText).toContain("_MANIFEST_:");
    expect(manifestText).toContain("TESTPROJ");
    expect(manifestText).toContain("sha256:fedcba9876543210");
  });
});
