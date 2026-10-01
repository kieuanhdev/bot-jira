/**
 * Safe Excel (.xlsx) Parser for Bulk Create.
 * Aligned with docs/BULK_CREATE_EXCEL_TEMPLATE_PLAN.md.
 */

import ExcelJS from "exceljs";
import {
  type BulkCreateProjectMetadata,
  type BulkCreateRowInput,
  type BulkParentRef,
  MAX_BULK_CREATE_ITEMS,
  MAX_SUMMARY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from "./create-types";
import {
  EXCEL_SCHEMA_VERSION,
  MAX_FILE_SIZE_BYTES,
  SHEET_NAME_TASKS,
  SHEET_NAME_CATALOG,
  type ExcelTemplateManifest,
  type CanonicalExcelColumn,
  normalizeExcelHeader,
  extractIdFromDropdownValue,
} from "./excel-schema";
import { ensureUniqueClientRefs } from "./client-ref";
import { isValidIsoDate, parseStrictPoints } from "./csv-parser";

export interface ParsedExcelRowError {
  row: number;
  col?: string;
  message: string;
}

export interface ParsedExcelResult {
  items: BulkCreateRowInput[];
  manifest: ExcelTemplateManifest | null;
  isStaleMetadata: boolean;
  projectKeyMatch: boolean;
  fileProjectKey?: string;
  totalRows: number;
  validCount: number;
  errorCount: number;
  skippedEmptyCount: number;
  overflowCount: number;
  errors: ParsedExcelRowError[];
  warnings: string[];
}

export interface ParseExcelOptions {
  targetProjectKey?: string;
  currentMetadata?: BulkCreateProjectMetadata | null;
}

/**
 * Extracts raw cell text safely, preventing formula injection.
 */
function getSafeCellValue(cell: ExcelJS.Cell): { text: string; isFormula: boolean } {
  if (cell.value === null || cell.value === undefined) {
    return { text: "", isFormula: false };
  }

  // Handle Date
  if (cell.value instanceof Date) {
    // Return ISO date string YYYY-MM-DD
    const y = cell.value.getUTCFullYear();
    const m = String(cell.value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cell.value.getUTCDate()).padStart(2, "0");
    return { text: `${y}-${m}-${d}`, isFormula: false };
  }

  // Check if cell is a formula
  if (typeof cell.value === "object" && "formula" in cell.value) {
    const resultVal = (cell.value as { result?: unknown }).result;
    return {
      text: resultVal !== undefined && resultVal !== null ? String(resultVal).trim() : "",
      isFormula: true,
    };
  }

  // Handle rich text
  if (typeof cell.value === "object" && "richText" in cell.value) {
    const richText = cell.value as { richText: Array<{ text: string }> };
    return {
      text: richText.richText.map((t) => t.text).join("").trim(),
      isFormula: false,
    };
  }

  const str = String(cell.value).trim();
  const startsWithDangerousChar = /^[=+\-@]/.test(str);

  return {
    text: startsWithDangerousChar ? str.replace(/^[=+\-@]+/, "") : str,
    isFormula: startsWithDangerousChar,
  };
}

/**
 * Parses an Excel buffer into BulkCreateRowInput items.
 */
export async function parseBulkCreateExcel(
  buffer: Buffer | ArrayBuffer,
  options: ParseExcelOptions = {}
): Promise<ParsedExcelResult> {
  const { targetProjectKey, currentMetadata } = options;
  const errors: ParsedExcelRowError[] = [];
  const warnings: string[] = [];

  const rawBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (rawBuffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Dung lượng file (${(rawBuffer.length / (1024 * 1024)).toFixed(2)} MB) vượt quá giới hạn 5 MB.`
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(rawBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (err) {
    throw new Error(
      `Không thể đọc file Excel (.xlsx). Vui lòng đảm bảo file không bị hỏng hoặc có mật khẩu bảo vệ. Chi tiết: ${(err as Error).message}`
    );
  }

  // 1. Locate Manifest
  let manifest: ExcelTemplateManifest | null = null;
  const catalogSheet =
    workbook.getWorksheet(SHEET_NAME_CATALOG) ||
    workbook.worksheets.find((w) => w.name.toLowerCase() === SHEET_NAME_CATALOG.toLowerCase());

  if (catalogSheet) {
    const manifestCellVal = catalogSheet.getCell("Z1").text;
    if (manifestCellVal && manifestCellVal.startsWith("_MANIFEST_:")) {
      try {
        manifest = JSON.parse(manifestCellVal.slice("_MANIFEST_:".length));
      } catch {
        // Corrupted manifest
      }
    }
  }

  let projectKeyMatch = true;
  let fileProjectKey: string | undefined = manifest?.projectKey;
  let isStaleMetadata = false;

  if (manifest) {
    if (manifest.schemaVersion > EXCEL_SCHEMA_VERSION) {
      throw new Error(
        `Phiên bản mẫu Excel (${manifest.schemaVersion}) không được hỗ trợ. Vui lòng tải lại mẫu mới.`
      );
    }

    if (targetProjectKey && manifest.projectKey) {
      if (manifest.projectKey.toUpperCase() !== targetProjectKey.toUpperCase()) {
        projectKeyMatch = false;
        errors.push({
          row: 1,
          message: `File Excel này được sinh cho dự án "${manifest.projectKey}", không khớp với dự án "${targetProjectKey}" đang chọn. Vui lòng tải mẫu đúng cho dự án ${targetProjectKey}.`,
        });
      }
    }

    if (currentMetadata && manifest.metadataFingerprint) {
      if (manifest.metadataFingerprint !== currentMetadata.fingerprint) {
        isStaleMetadata = true;
        warnings.push(
          `Cấu hình của dự án "${targetProjectKey || manifest.projectKey}" đã thay đổi kể từ khi tải file mẫu. Dữ liệu sẽ được đối chiếu và xác thực theo cấu hình mới nhất trên Jira.`
        );
      }
    }
  } else {
    warnings.push(
      "Không tìm thấy thông tin cấu hình gốc (manifest) trong file Excel. File sẽ được xử lý theo dạng tiêu chuẩn."
    );
  }

  // If project key mismatched, return early with errors
  if (!projectKeyMatch) {
    return {
      items: [],
      manifest,
      isStaleMetadata,
      projectKeyMatch: false,
      fileProjectKey,
      totalRows: 0,
      validCount: 0,
      errorCount: errors.length,
      skippedEmptyCount: 0,
      overflowCount: 0,
      errors,
      warnings,
    };
  }

  // 2. Locate Tasks Worksheet
  const tasksSheet =
    workbook.getWorksheet(SHEET_NAME_TASKS) ||
    workbook.worksheets.find((w) => w.name.toLowerCase() === SHEET_NAME_TASKS.toLowerCase()) ||
    workbook.worksheets[0];

  if (!tasksSheet) {
    throw new Error("Không tìm thấy trang tính (worksheet) nào trong file Excel.");
  }

  // 3. Parse Header Row (Row 1)
  const headerRow = tasksSheet.getRow(1);
  const columnMap = new Map<number, CanonicalExcelColumn>(); // 1-based colNumber -> CanonicalExcelColumn
  const seenCanonical = new Set<CanonicalExcelColumn>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const rawVal = cell.text?.trim() || "";
    const canonical = normalizeExcelHeader(rawVal);
    if (canonical) {
      if (seenCanonical.has(canonical)) {
        warnings.push(`Cột "${rawVal}" (cột ${colNumber}) bị trùng với một cột khác đã được nhận diện.`);
      } else {
        seenCanonical.add(canonical);
        columnMap.set(colNumber, canonical);
      }
    }
  });

  if (!seenCanonical.has("summary")) {
    throw new Error(
      'File Excel thiếu cột tiêu đề bắt buộc "Summary" (hoặc "Tiêu đề"). Vui lòng kiểm tra lại sheet dữ liệu.'
    );
  }

  // 4. Build Lookup Maps from Current Metadata if available
  const issueTypesById = new Map<string, string>();
  const issueTypesByName = new Map<string, string>();
  if (currentMetadata) {
    for (const it of currentMetadata.issueTypes) {
      issueTypesById.set(it.id.toLowerCase(), it.id);
      issueTypesByName.set(it.name.toLowerCase(), it.id);
    }
  }

  const prioritiesById = new Map<string, string>();
  const prioritiesByName = new Map<string, string>();
  if (currentMetadata) {
    for (const pr of currentMetadata.priorityOptions) {
      prioritiesById.set(pr.id.toLowerCase(), pr.id);
      prioritiesByName.set(pr.name.toLowerCase(), pr.id);
    }
  }

  const versionsById = new Map<string, string>();
  const versionsByName = new Map<string, string>();
  if (currentMetadata) {
    for (const v of currentMetadata.versionOptions) {
      versionsById.set(v.id.toLowerCase(), v.id);
      versionsByName.set(v.name.toLowerCase(), v.id);
    }
  }

  // 5. Read Data Rows
  const parsedItems: BulkCreateRowInput[] = [];
  let skippedEmptyCount = 0;
  let totalDataRowsRead = 0;

  const totalRowCount = tasksSheet.rowCount;

  for (let r = 2; r <= totalRowCount; r++) {
    const row = tasksSheet.getRow(r);

    // Extract values
    let rowClientRef = "";
    let rowSummary = "";
    let rowIssueType = "";
    let rowParentRef = "";
    let rowParentKey = "";
    let rowDescription = "";
    let rowAssignee = "";
    let rowPriority = "";
    let rowLabelsStr = "";
    let rowPointsVal: number | null | undefined = undefined;
    let rowEstimate = "";
    let rowDueDate = "";
    let rowFixVersionsStr = "";

    let hasNonDefaultContent = false;
    let hasFormula = false;

    columnMap.forEach((canonicalKey, colNumber) => {
      const cell = row.getCell(colNumber);
      const safe = getSafeCellValue(cell);
      if (safe.isFormula) hasFormula = true;
      const textVal = safe.text;

      switch (canonicalKey) {
        case "clientRef":
          rowClientRef = textVal;
          break;
        case "summary":
          rowSummary = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "issueTypeId":
          rowIssueType = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "parentRef":
          rowParentRef = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "parentKey":
          rowParentKey = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "description":
          rowDescription = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "assignee":
          rowAssignee = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "priorityId":
          rowPriority = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "labels":
          rowLabelsStr = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "points":
          if (textVal) {
            hasNonDefaultContent = true;
            const parsedPt = parseStrictPoints(textVal);
            if (parsedPt.ok) {
              rowPointsVal = parsedPt.points;
            } else {
              errors.push({
                row: r,
                col: "Story Points",
                message: `Dòng ${r}: ${parsedPt.error}`,
              });
            }
          }
          break;
        case "originalEstimate":
          rowEstimate = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
        case "dueDate":
          if (textVal) {
            hasNonDefaultContent = true;
            if (isValidIsoDate(textVal)) {
              rowDueDate = textVal;
            } else {
              errors.push({
                row: r,
                col: "Due Date",
                message: `Dòng ${r}: Ngày "${textVal}" không đúng định dạng YYYY-MM-DD.`,
              });
            }
          }
          break;
        case "fixVersionIds":
          rowFixVersionsStr = textVal;
          if (textVal) hasNonDefaultContent = true;
          break;
      }
    });

    // Check if this row is completely empty (ignoring pre-filled TASK-xxx clientRef)
    if (!hasNonDefaultContent && (!rowClientRef || /^TASK-\d{3}$/i.test(rowClientRef))) {
      skippedEmptyCount++;
      continue;
    }

    totalDataRowsRead++;

    if (hasFormula) {
      warnings.push(`Dòng ${r} chứa công thức tính toán. Hệ thống đã trích xuất giá trị hiển thị kết quả.`);
    }

    // Row validations
    if (!rowSummary) {
      errors.push({
        row: r,
        col: "Summary",
        message: `Dòng ${r}: Tiêu đề (Summary) là bắt buộc và không được để trống.`,
      });
    } else if (rowSummary.length > MAX_SUMMARY_LENGTH) {
      errors.push({
        row: r,
        col: "Summary",
        message: `Dòng ${r}: Tiêu đề vượt quá giới hạn ${MAX_SUMMARY_LENGTH} ký tự (hiện có ${rowSummary.length} ký tự).`,
      });
    }

    if (rowDescription && rowDescription.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        row: r,
        col: "Description",
        message: `Dòng ${r}: Mô tả vượt quá giới hạn ${MAX_DESCRIPTION_LENGTH} ký tự.`,
      });
    }

    // Parent ref validation
    let parentRefObj: BulkParentRef | null = null;
    if (rowParentRef && rowParentKey) {
      errors.push({
        row: r,
        col: "Parent",
        message: `Dòng ${r}: Không được điền đồng thời cả "Parent Ref" (${rowParentRef}) và "Parent Jira Key" (${rowParentKey}). Chỉ được chọn 1 trong 2.`,
      });
    } else if (rowParentRef) {
      parentRefObj = { type: "batch", clientRef: rowParentRef.trim() };
    } else if (rowParentKey) {
      parentRefObj = { type: "jira", jiraKey: rowParentKey.trim().toUpperCase() };
    }

    // Issue Type mapping
    let mappedIssueTypeId: string | undefined = undefined;
    if (rowIssueType) {
      const extracted = extractIdFromDropdownValue(rowIssueType);
      if (extracted.id) {
        mappedIssueTypeId = extracted.id;
      } else {
        const lower = extracted.name.toLowerCase();
        mappedIssueTypeId = issueTypesByName.get(lower) || issueTypesById.get(lower) || extracted.name;
      }
    }

    // Priority mapping
    let mappedPriorityId: string | undefined = undefined;
    if (rowPriority) {
      const extracted = extractIdFromDropdownValue(rowPriority);
      if (extracted.id) {
        mappedPriorityId = extracted.id;
      } else {
        const lower = extracted.name.toLowerCase();
        mappedPriorityId = prioritiesByName.get(lower) || prioritiesById.get(lower) || extracted.name;
      }
    }

    // Assignee mapping
    let mappedAssignee: string | null | undefined = undefined;
    if (rowAssignee) {
      const extracted = extractIdFromDropdownValue(rowAssignee);
      mappedAssignee = extracted.id ? extracted.id : extracted.name;
    }

    // Labels mapping
    let mappedLabels: string[] | undefined = undefined;
    if (rowLabelsStr) {
      mappedLabels = rowLabelsStr
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
    }

    // Fix Versions mapping
    let mappedFixVersionIds: string[] | undefined = undefined;
    if (rowFixVersionsStr) {
      const rawParts = rowFixVersionsStr.split(",").map((p) => p.trim()).filter(Boolean);
      mappedFixVersionIds = rawParts.map((part) => {
        const extracted = extractIdFromDropdownValue(part);
        if (extracted.id) return extracted.id;
        const lower = extracted.name.toLowerCase();
        return versionsByName.get(lower) || versionsById.get(lower) || extracted.name;
      });
    }

    const item: BulkCreateRowInput = {
      clientRef: rowClientRef.trim(),
      summary: rowSummary.trim(),
      issueTypeId: mappedIssueTypeId,
      parent: parentRefObj,
      description: rowDescription || undefined,
      assignee: mappedAssignee,
      priorityId: mappedPriorityId,
      labels: mappedLabels,
      points: rowPointsVal,
      originalEstimate: rowEstimate.trim() || undefined,
      dueDate: rowDueDate || undefined,
      fixVersionIds: mappedFixVersionIds,
    };

    parsedItems.push(item);
  }

  // Handle overflow (cap at MAX_BULK_CREATE_ITEMS = 100)
  let overflowCount = 0;
  let finalItems = parsedItems;
  if (parsedItems.length > MAX_BULK_CREATE_ITEMS) {
    overflowCount = parsedItems.length - MAX_BULK_CREATE_ITEMS;
    finalItems = parsedItems.slice(0, MAX_BULK_CREATE_ITEMS);
    warnings.push(
      `File có ${parsedItems.length} dòng dữ liệu, vượt quá giới hạn tối đa ${MAX_BULK_CREATE_ITEMS} dòng. Hệ thống chỉ lấy ${MAX_BULK_CREATE_ITEMS} dòng đầu tiên.`
    );
  }

  // Ensure unique clientRef identifiers
  const itemsWithUniqueRefs = ensureUniqueClientRefs(finalItems);

  const errorRowCount = new Set(errors.map((e) => e.row)).size;
  const validCount = Math.max(0, finalItems.length - errorRowCount);

  return {
    items: itemsWithUniqueRefs,
    manifest,
    isStaleMetadata,
    projectKeyMatch: true,
    fileProjectKey,
    totalRows: totalDataRowsRead,
    validCount,
    errorCount: errors.length,
    skippedEmptyCount,
    overflowCount,
    errors,
    warnings,
  };
}
