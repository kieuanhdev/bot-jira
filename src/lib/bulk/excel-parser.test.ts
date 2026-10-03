import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { generateBulkCreateExcelTemplate } from "./excel-template";
import { parseBulkCreateExcel } from "./excel-parser";
import { type BulkCreateProjectMetadata } from "./create-types";

describe("excel-parser", () => {
  const mockMetadata: BulkCreateProjectMetadata = {
    project: { key: "EPM", name: "Engineering Project" },
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
    versionOptions: [{ id: "10420", name: "Release 1.0" }],
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
    fingerprint: "sha256:current-fingerprint",
  };

  it("parses empty template without data rows returning 0 items and skipping placeholder rows", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata,
      assignees: [{ username: "dev1", displayName: "Dev One" }],
    });

    const parsed = await parseBulkCreateExcel(templateBuffer, {
      targetProjectKey: "EPM",
      currentMetadata: mockMetadata,
    });

    expect(parsed.items).toHaveLength(0);
    expect(parsed.totalRows).toBe(0);
    expect(parsed.skippedEmptyCount).toBe(100);
    expect(parsed.manifest?.projectKey).toBe("EPM");
    expect(parsed.isStaleMetadata).toBe(false);
  });

  it("parses filled data rows, maps display dropdowns to IDs, and handles parent refs", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata,
      assignees: [{ username: "dev1", displayName: "Dev One" }],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const tasksSheet = workbook.getWorksheet("Tasks")!;

    // Fill Row 2: Parent Task
    // Columns: Client Ref, Summary, Issue Type, Parent Ref, Parent Jira Key, Description, Assignee, Priority, Labels, Story Points, Original Estimate, Due Date, Fix Versions
    const row2 = tasksSheet.getRow(2);
    row2.getCell(1).value = "TASK-001";
    row2.getCell(2).value = "Xây dựng backend API";
    row2.getCell(3).value = "Task [10001]";
    row2.getCell(6).value = "Mô tả chi tiết...";
    row2.getCell(7).value = "Dev One [dev1]";
    row2.getCell(8).value = "Major [3]";
    row2.getCell(9).value = "backend, api";
    row2.getCell(10).value = 5;
    row2.getCell(11).value = "2d";
    row2.getCell(12).value = "2026-10-20";
    row2.getCell(13).value = "Release 1.0 [10420]";

    // Fill Row 3: Sub-task with Parent Ref
    const row3 = tasksSheet.getRow(3);
    row3.getCell(1).value = "TASK-002";
    row3.getCell(2).value = "Tạo schema database";
    row3.getCell(3).value = "Sub-task [10002]";
    row3.getCell(4).value = "TASK-001"; // Parent Ref
    row3.getCell(10).value = 2;

    // Fill Row 4: Sub-task with Parent Jira Key
    const row4 = tasksSheet.getRow(4);
    row4.getCell(1).value = "TASK-003";
    row4.getCell(2).value = "Viết migration script";
    row4.getCell(3).value = "Sub-task [10002]";
    row4.getCell(5).value = "EPM-999"; // Parent Jira Key

    const modifiedBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseBulkCreateExcel(modifiedBuffer, {
      targetProjectKey: "EPM",
      currentMetadata: mockMetadata,
    });

    expect(parsed.errors).toHaveLength(0);
    expect(parsed.items).toHaveLength(3);

    // Verify row 1 (TASK-001)
    const item1 = parsed.items[0];
    expect(item1.clientRef).toBe("TASK-001");
    expect(item1.summary).toBe("Xây dựng backend API");
    expect(item1.issueTypeId).toBe("10001");
    expect(item1.assignee).toBe("dev1");
    expect(item1.priorityId).toBe("3");
    expect(item1.labels).toEqual(["backend", "api"]);
    expect(item1.points).toBe(5);
    expect(item1.originalEstimate).toBe("2d");
    expect(item1.dueDate).toBe("2026-10-20");
    expect(item1.fixVersionIds).toEqual(["10420"]);
    expect(item1.parent).toBeNull();

    // Verify row 2 (TASK-002) with Parent Ref
    const item2 = parsed.items[1];
    expect(item2.clientRef).toBe("TASK-002");
    expect(item2.issueTypeId).toBe("10002");
    expect(item2.parent).toEqual({ type: "batch", clientRef: "TASK-001" });

    // Verify row 3 (TASK-003) with Parent Jira Key
    const item3 = parsed.items[2];
    expect(item3.clientRef).toBe("TASK-003");
    expect(item3.parent).toEqual({ type: "jira", jiraKey: "EPM-999" });
  });

  it("detects and flags conflicting parentRef and parentKey on the same row", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const tasksSheet = workbook.getWorksheet("Tasks")!;

    const row2 = tasksSheet.getRow(2);
    row2.getCell(2).value = "Invalid Subtask";
    row2.getCell(4).value = "TASK-001";
    row2.getCell(5).value = "EPM-100";

    const modifiedBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseBulkCreateExcel(modifiedBuffer, {
      targetProjectKey: "EPM",
      currentMetadata: mockMetadata,
    });

    expect(parsed.errors.some((e) => e.message.includes("Không được điền đồng thời"))).toBe(true);
  });

  it("detects stale metadata when fingerprint in manifest differs from current metadata", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata,
    });

    const parsed = await parseBulkCreateExcel(templateBuffer, {
      targetProjectKey: "EPM",
      currentMetadata: {
        ...mockMetadata,
        fingerprint: "sha256:different-fingerprint",
      },
    });

    expect(parsed.isStaleMetadata).toBe(true);
    expect(parsed.warnings.some((w) => w.includes("đã thay đổi"))).toBe(true);
  });

  it("rejects file if project key in manifest does not match target project", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata, // EPM
    });

    const parsed = await parseBulkCreateExcel(templateBuffer, {
      targetProjectKey: "OTHERPROJ",
      currentMetadata: mockMetadata,
    });

    expect(parsed.projectKeyMatch).toBe(false);
    expect(parsed.errors.some((e) => e.message.includes("không khớp với dự án"))).toBe(true);
  });

  it("reports duplicate and missing parent references instead of silently accepting broken links", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({ metadata: mockMetadata });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const tasksSheet = workbook.getWorksheet("Tasks")!;

    tasksSheet.getRow(2).getCell(2).value = "Parent A";
    tasksSheet.getRow(2).getCell(3).value = "Task [10001]";
    tasksSheet.getRow(3).getCell(1).value = "TASK-001";
    tasksSheet.getRow(3).getCell(2).value = "Duplicate ref";
    tasksSheet.getRow(3).getCell(3).value = "Task [10001]";
    tasksSheet.getRow(4).getCell(2).value = "Orphan subtask";
    tasksSheet.getRow(4).getCell(3).value = "Sub-task [10002]";
    tasksSheet.getRow(4).getCell(4).value = "TASK-999";

    const parsed = await parseBulkCreateExcel(Buffer.from(await workbook.xlsx.writeBuffer()), {
      targetProjectKey: "EPM",
      currentMetadata: mockMetadata,
    });

    expect(parsed.errors.filter((error) => error.col === "Client Ref")).toHaveLength(2);
    expect(parsed.errors.some((error) => error.message.includes('Không tìm thấy Parent Ref "TASK-999"'))).toBe(true);
  });

  it("rejects stale catalog values and preserves legitimate leading punctuation", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({ metadata: mockMetadata });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const row = workbook.getWorksheet("Tasks")!.getRow(2);
    row.getCell(2).value = "- Cập nhật tài liệu";
    row.getCell(3).value = "Removed Type [99999]";
    row.getCell(8).value = "Removed Priority [999]";
    row.getCell(13).value = "Removed Version [888]";

    const parsed = await parseBulkCreateExcel(Buffer.from(await workbook.xlsx.writeBuffer()), {
      targetProjectKey: "EPM",
      currentMetadata: mockMetadata,
    });

    expect(parsed.items[0].summary).toBe("- Cập nhật tài liệu");
    expect(parsed.errors.map((error) => error.col)).toEqual(
      expect.arrayContaining(["Issue Type", "Priority", "Fix Versions"])
    );
  });
});
