/**
 * Bulk Create Excel Template Generator using ExcelJS.
 * Aligned with docs/BULK_CREATE_EXCEL_TEMPLATE_PLAN.md.
 */

import ExcelJS from "exceljs";
import { type BulkCreateProjectMetadata } from "./create-types";
import {
  EXCEL_SCHEMA_VERSION,
  MAX_EXCEL_ITEMS,
  SHEET_NAME_TASKS,
  SHEET_NAME_CATALOG,
  SHEET_NAME_GUIDE,
  SHEET_NAME_EXAMPLES,
  type ExcelTemplateManifest,
  getActiveColumnsForProject,
} from "./excel-schema";

export interface GenerateTemplateOptions {
  metadata: BulkCreateProjectMetadata;
  assignees?: Array<{ username: string; displayName: string }>;
}

/**
 * Generates an Excel workbook for bulk creating Jira tasks based on project metadata.
 * Returns a Buffer of the generated .xlsx file.
 */
export async function generateBulkCreateExcelTemplate(
  options: GenerateTemplateOptions
): Promise<Buffer> {
  const { metadata, assignees = [] } = options;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Team Task Web";
  workbook.lastModifiedBy = "Team Task Web";
  workbook.created = new Date();
  workbook.modified = new Date();

  const manifest: ExcelTemplateManifest = {
    schemaVersion: EXCEL_SCHEMA_VERSION,
    projectKey: metadata.project.key,
    projectName: metadata.project.name,
    generatedAt: new Date().toISOString(),
    metadataFingerprint: metadata.fingerprint,
    maxItems: MAX_EXCEL_ITEMS,
  };

  workbook.title = `Bulk Create Template - ${metadata.project.key}`;
  workbook.subject = `Jira Bulk Create Template for project ${metadata.project.key}`;

  const columns = getActiveColumnsForProject(metadata);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Sheet `Tasks` (Primary data sheet)
  // ─────────────────────────────────────────────────────────────────────────────
  const tasksSheet = workbook.addWorksheet(SHEET_NAME_TASKS, {
    views: [{ state: "frozen", ySplit: 1, activeCell: "A2" }],
  });

  // Setup columns
  tasksSheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
  }));

  // Format header row (Row 1)
  const headerRow = tasksSheet.getRow(1);
  headerRow.height = 30;

  headerRow.eachCell((cell, colNumber) => {
    const colDef = columns[colNumber - 1];
    const isRequired = colDef?.required;

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      // Teal #0D9488 from design system; slightly darker accent for required columns
      fgColor: { argb: isRequired ? "FF0D9488" : "FF134E4A" },
    };

    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };

    cell.alignment = {
      vertical: "middle",
      horizontal: isRequired ? "center" : "left",
      wrapText: false,
    };

    cell.border = {
      top: { style: "thin", color: { argb: "FF0F766E" } },
      left: { style: "thin", color: { argb: "FF0F766E" } },
      bottom: { style: "medium", color: { argb: "FF0F766E" } },
      right: { style: "thin", color: { argb: "FF0F766E" } },
    };

    if (colDef?.comment) {
      cell.note = {
        texts: [{ font: { size: 10, bold: false, color: { argb: "FF000000" } }, text: colDef.comment }],
        margins: { insetmode: "custom", inset: [0.1, 0.1, 0.1, 0.1] },
      };
    }
  });

  // Turn on autofilter for header row
  tasksSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Sheet `Danh_muc` (Hidden catalog sheet for dropdown validation)
  // ─────────────────────────────────────────────────────────────────────────────
  const catalogSheet = workbook.addWorksheet(SHEET_NAME_CATALOG);
  catalogSheet.state = "hidden";

  // Catalog columns:
  // Col A: Issue Types
  // Col B: Priorities
  // Col C: Assignees
  // Col D: Fix Versions
  const catalogIssueTypes = metadata.issueTypes.map((t) => `${t.name} [${t.id}]`);
  const catalogPriorities = metadata.priorityOptions.map((p) => `${p.name} [${p.id}]`);
  const catalogAssignees = assignees.map((u) => `${u.displayName} [${u.username}]`);
  const catalogFixVersions = metadata.versionOptions.map((v) => `${v.name} [${v.id}]`);

  // Write headers for catalog
  catalogSheet.getRow(1).values = [
    "Issue Types",
    "Priorities",
    "Assignees",
    "Fix Versions",
  ];
  catalogSheet.getRow(1).font = { bold: true };

  // Write catalog rows
  const maxCatalogRows = Math.max(
    catalogIssueTypes.length,
    catalogPriorities.length,
    catalogAssignees.length,
    catalogFixVersions.length,
    1
  );

  for (let r = 0; r < maxCatalogRows; r++) {
    const row = catalogSheet.getRow(r + 2);
    if (r < catalogIssueTypes.length) row.getCell(1).value = catalogIssueTypes[r];
    if (r < catalogPriorities.length) row.getCell(2).value = catalogPriorities[r];
    if (r < catalogAssignees.length) row.getCell(3).value = catalogAssignees[r];
    if (r < catalogFixVersions.length) row.getCell(4).value = catalogFixVersions[r];
  }

  // Store manifest in hidden cell Z1 of Danh_muc sheet
  catalogSheet.getCell("Z1").value = `_MANIFEST_:${JSON.stringify(manifest)}`;

  // Cross-sheet validation lists are reliable when backed by workbook names.
  const addCatalogName = (name: string, column: string, itemCount: number) => {
    if (itemCount === 0) return null;
    workbook.definedNames.add(
      `${SHEET_NAME_CATALOG}!$${column}$2:$${column}$${itemCount + 1}`,
      name
    );
    return name;
  };

  workbook.definedNames.add(
    `${SHEET_NAME_TASKS}!$A$2:$A$${MAX_EXCEL_ITEMS + 1}`,
    "TaskClientRefs"
  );

  const catalogRangeMap: Record<string, string | null> = {
    issueTypes: addCatalogName("IssueTypes", "A", catalogIssueTypes.length),
    priorities: addCatalogName("Priorities", "B", catalogPriorities.length),
    assignees: addCatalogName("Assignees", "C", catalogAssignees.length),
    fixVersions: addCatalogName("FixVersions", "D", catalogFixVersions.length),
  };

  // Pre-populate 100 rows in Tasks sheet
  for (let i = 1; i <= MAX_EXCEL_ITEMS; i++) {
    const rowIndex = i + 1; // Row 2 to 101
    const row = tasksSheet.getRow(rowIndex);
    row.height = 22;

    columns.forEach((colDef, colIdx) => {
      const cell = row.getCell(colIdx + 1);

      // Pre-fill Client Ref as TASK-001, TASK-002...
      if (colDef.key === "clientRef") {
        cell.value = `TASK-${String(i).padStart(3, "0")}`;
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF475569" } };
      } else {
        cell.font = { name: "Calibri", size: 10 };
        cell.alignment = {
          vertical: "middle",
          horizontal: colDef.dataType === "number" || colDef.dataType === "date" ? "center" : "left",
          wrapText: colDef.key === "description",
        };
      }

      // Border for all data cells
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };

      // Set cell formatting / data validations
      if (colDef.dropdownCatalogKey) {
        const rangeFormula = catalogRangeMap[colDef.dropdownCatalogKey];
        if (rangeFormula) {
          cell.dataValidation = {
            type: "list",
            allowBlank: !colDef.required,
            formulae: [rangeFormula],
            showErrorMessage: true,
            errorTitle: "Giá trị không hợp lệ",
            error: "Vui lòng chọn giá trị từ danh sách dropdown hoặc điền chính xác mã ID.",
          };
        }
      } else if (colDef.key === "parentRef") {
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ["TaskClientRefs"],
          showErrorMessage: true,
          errorTitle: "Task cha không hợp lệ",
          error: "Chọn Client Ref của task cha trong cùng file. Task cha đã có trên Jira phải nhập ở cột Parent Jira Key.",
        };
      } else if (colDef.key === "points") {
        cell.dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          formulae: [0],
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Lỗi Story Points",
          error: "Story Points phải là số nguyên không âm (>= 0).",
        };
      } else if (colDef.key === "dueDate") {
        cell.numFmt = "yyyy-mm-dd";
        cell.dataValidation = {
          type: "date",
          operator: "between",
          formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)],
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Ngày không hợp lệ",
          error: "Nhập ngày hợp lệ theo định dạng YYYY-MM-DD.",
        };
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Sheet `Vi_du` contains examples only; the importer reads `Tasks`.
  // ─────────────────────────────────────────────────────────────────────────────
  const examplesSheet = workbook.addWorksheet(SHEET_NAME_EXAMPLES, {
    views: [{ state: "frozen", ySplit: 3, activeCell: "A4" }],
  });
  examplesSheet.columns = [
    { key: "clientRef", width: 16 },
    { key: "summary", width: 40 },
    { key: "issueType", width: 24 },
    { key: "parentRef", width: 18 },
    { key: "parentKey", width: 20 },
    { key: "note", width: 52 },
  ];
  examplesSheet.mergeCells("A1:F1");
  examplesSheet.getCell("A1").value = "VÍ DỤ THAM KHẢO — KHÔNG NHẬP DỮ LIỆU THẬT Ở SHEET NÀY";
  examplesSheet.getCell("A1").font = { bold: true, color: { argb: "FF92400E" } };
  examplesSheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  examplesSheet.getCell("A1").alignment = { horizontal: "center" };
  examplesSheet.mergeCells("A2:F2");
  examplesSheet.getCell("A2").value = "Điền dữ liệu thật tại sheet Tasks. Các dòng dưới chỉ minh hoạ cách liên kết task cha–con.";
  examplesSheet.getRow(3).values = ["Client Ref", "Summary", "Issue Type", "Parent Ref", "Parent Jira Key", "Giải thích"];
  examplesSheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
  examplesSheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } };
  const standardType = metadata.issueTypes.find((item) => !item.subtask) || metadata.issueTypes[0];
  const subtaskType = metadata.issueTypes.find((item) => item.subtask);
  examplesSheet.getRow(4).values = [
    "TASK-001",
    "Xây dựng API đăng nhập",
    standardType ? standardType.name + " [" + standardType.id + "]" : "Task",
    "",
    "",
    "Task thường, không cần task cha.",
  ];
  if (subtaskType) {
    examplesSheet.getRow(5).values = [
      "TASK-002",
      "Viết kiểm thử API đăng nhập",
      subtaskType.name + " [" + subtaskType.id + "]",
      "TASK-001",
      "",
      "Sub-task trỏ đến task cha trong cùng file bằng Parent Ref.",
    ];
    examplesSheet.getRow(6).values = [
      "TASK-003",
      "Bổ sung tài liệu",
      subtaskType.name + " [" + subtaskType.id + "]",
      "",
      metadata.project.key + "-123",
      "Sub-task trỏ đến task cha đã có trên Jira bằng Parent Jira Key.",
    ];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Sheet `Huong_dan` (Instructions sheet)
  // ─────────────────────────────────────────────────────────────────────────────
  const guideSheet = workbook.addWorksheet(SHEET_NAME_GUIDE);
  guideSheet.views = [{ showGridLines: true }];

  guideSheet.getColumn(1).width = 4;
  guideSheet.getColumn(2).width = 24;
  guideSheet.getColumn(3).width = 75;

  // Title
  const titleRow = guideSheet.getRow(2);
  titleRow.height = 36;
  const titleCell = titleRow.getCell(2);
  titleCell.value = "HƯỚNG DẪN SỬ DỤNG MẪU EXCEL TẠO TASK HÀNG LOẠT (BULK CREATE)";
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF0D9488" } };
  titleCell.alignment = { vertical: "middle" };

  // Project Info
  guideSheet.getRow(4).values = ["", "Dự án áp dụng:", `${metadata.project.name} (${metadata.project.key})`];
  guideSheet.getRow(4).getCell(2).font = { bold: true };
  guideSheet.getRow(5).values = ["", "Thời điểm sinh mẫu:", new Date().toLocaleString("vi-VN")];
  guideSheet.getRow(5).getCell(2).font = { bold: true };
  guideSheet.getRow(6).values = ["", "Giới hạn tối đa:", `${MAX_EXCEL_ITEMS} task trong 1 file`];
  guideSheet.getRow(6).getCell(2).font = { bold: true };

  // Guidelines table
  const instructions = [
    {
      col: "Quy tắc chung",
      text: "Chỉ nhập dữ liệu thật trong sheet 'Tasks'. Sheet 'Vi_du' chỉ để tham khảo. Không đổi tên sheet Tasks hoặc tên các cột tiêu đề. Mỗi dòng đại diện cho một task.",
    },
    {
      col: "Client Ref *",
      text: "Mã định danh duy nhất trong file (đã tạo sẵn TASK-001 đến TASK-100). Không được xóa hoặc để trùng nhau giữa các dòng.",
    },
    {
      col: "Summary *",
      text: "Tiêu đề của task. Tối đa 255 ký tự. Bắt buộc phải có nội dung.",
    },
    {
      col: "Issue Type *",
      text: "Loại issue. Bấm vào ô để chọn từ dropdown tương ứng với cấu hình của dự án.",
    },
    {
      col: "Parent Ref vs Parent Jira Key",
      text: "Chỉ điền một trong hai cột khi tạo Sub-task:\n• 'Parent Ref': Điền Client Ref của task cha TRONG CÙNG FILE (vd: TASK-001).\n• 'Parent Jira Key': Điền Jira key của task cha ĐÃ CÓ SẴN TRÊN JIRA (vd: PROJ-123).\nKhông điền đồng thời cả hai cột.",
    },
    {
      col: "Assignee & Priority",
      text: "Chọn từ dropdown. Người dùng cũng có thể nhập username trực tiếp nếu biết.",
    },
    {
      col: "Labels",
      text: "Nhãn phân loại. Nếu có nhiều nhãn, phân cách bằng dấu phẩy (ví dụ: frontend, mobile, v1).",
    },
    {
      col: "Story Points",
      text: "Điểm Story Points phải là số nguyên không âm (vd: 1, 2, 3, 5, 8...).",
    },
    {
      col: "Original Estimate",
      text: "Thời gian ước tính theo cú pháp của Jira (vd: 1d 4h, 2h 30m, 45m).",
    },
    {
      col: "Due Date",
      text: "Hạn hoàn thành theo định dạng YYYY-MM-DD (vd: 2026-10-15).",
    },
    {
      col: "Tải lên hệ thống",
      text: "Sau khi điền xong dữ liệu, lưu file (.xlsx) và tải lên tại mục 'Nhập CSV / Dán Excel' trên trang Bulk Create.",
    },
  ];

  let currentGuideRow = 8;
  const guideHeaderRow = guideSheet.getRow(currentGuideRow);
  guideHeaderRow.values = ["", "Hạng mục / Cột", "Hướng dẫn chi tiết"];
  guideHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  guideHeaderRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } };
  guideHeaderRow.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } };

  currentGuideRow++;
  for (const item of instructions) {
    const row = guideSheet.getRow(currentGuideRow);
    row.values = ["", item.col, item.text];
    row.getCell(2).font = { bold: true };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
    row.getCell(2).border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    row.getCell(3).border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } },
    };
    currentGuideRow++;
  }

  // Generate buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
