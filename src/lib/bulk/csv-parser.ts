import {
  type BulkCreateRowInput,
  MAX_BULK_CREATE_ITEMS,
} from "./create-types";
import { generateUniqueClientRef } from "./client-ref";

export type ParsedCsvRowError = {
  line: number;
  field?: string;
  message: string;
};

export type ParsedCsvResult = {
  items: BulkCreateRowInput[];
  headers: string[];
  recognizedHeaders: Record<string, string>; // rawHeader -> canonicalField
  unrecognizedHeaders: string[];
  duplicateCanonicalHeaders: string[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  skippedEmptyCount: number;
  overflowCount: number;
  errors: ParsedCsvRowError[];
  warnings: string[];
};

const CANONICAL_FIELD_MAP: Record<string, keyof BulkCreateRowInput> = {
  summary: "summary",
  title: "summary",
  tieude: "summary",
  tomtat: "summary",
  "tiêu đề": "summary",
  "tóm tắt": "summary",

  issuetype: "issueTypeId",
  "issue type": "issueTypeId",
  type: "issueTypeId",
  loai: "issueTypeId",
  "loại": "issueTypeId",
  "loại task": "issueTypeId",
  "loại issue": "issueTypeId",

  description: "description",
  desc: "description",
  mota: "description",
  "mô tả": "description",

  assignee: "assignee",
  assign: "assignee",
  "người thực hiện": "assignee",
  "gán cho": "assignee",
  user: "assignee",

  priority: "priorityId",
  priorities: "priorityId",
  "mức độ ưu tiên": "priorityId",
  "độ ưu tiên": "priorityId",
  "mức ưu tiên": "priorityId",

  labels: "labels",
  label: "labels",
  tags: "labels",
  tag: "labels",
  nhan: "labels",
  "nhãn": "labels",

  points: "points",
  point: "points",
  "story points": "points",
  storypoints: "points",
  "task points": "points",
  diem: "points",
  "điểm": "points",

  originalestimate: "originalEstimate",
  "original estimate": "originalEstimate",
  estimate: "originalEstimate",
  "thời gian ước tính": "originalEstimate",
  "ước tính": "originalEstimate",

  duedate: "dueDate",
  "due date": "dueDate",
  due: "dueDate",
  "hạn chót": "dueDate",
  "hạn hoàn thành": "dueDate",
  "ngày hết hạn": "dueDate",

  fixversions: "fixVersionIds",
  "fix versions": "fixVersionIds",
  fixversion: "fixVersionIds",
  versions: "fixVersionIds",
  version: "fixVersionIds",
  "phiên bản": "fixVersionIds",

  clientref: "clientRef",
  "client ref": "clientRef",
  ref: "clientRef",
  id: "clientRef",
  ma: "clientRef",
  "mã": "clientRef",
};

/**
 * Validates strictly that date string is YYYY-MM-DD and exists in calendar (handles leap years, month lengths).
 */
export function isValidIsoDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (m < 1 || m > 12) return false;
  if (d < 1) return false;
  const isLeap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= daysInMonth[m - 1];
}

/**
 * Parses points strictly as a non-negative whole integer.
 * Rejects floats ("3.5"), suffixes ("3abc"), and negatives ("-1").
 */
export function parseStrictPoints(str: string): { ok: true; points: number } | { ok: false; error: string } {
  const trimmed = str.trim();
  if (!trimmed) return { ok: false, error: "Giá trị trống" };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `Story Points phải là số nguyên không âm (nhận: "${trimmed}")` };
  }
  const val = parseInt(trimmed, 10);
  return { ok: true, points: val };
}

export type TokenizeResult = {
  rows: Array<{
    cells: string[];
    line: number;
  }>;
  hasUnclosedQuote: boolean;
  unclosedQuoteLine?: number;
};

/**
 * Tokenize CSV/TSV text into rows of string cells with line tracking and quote handling.
 */
export function tokenizeDelimitedText(
  rawText: string,
  preferredDelimiter?: "," | "\t" | ";"
): TokenizeResult {
  let text = rawText;
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Autodetect delimiter if not specified
  const firstLine = text.split("\n")[0] || "";
  let delimiter = preferredDelimiter;
  if (!delimiter) {
    const tabs = (firstLine.match(/\t/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    if (tabs > commas && tabs > semicolons) {
      delimiter = "\t";
    } else if (semicolons > commas && semicolons > tabs) {
      delimiter = ";";
    } else {
      delimiter = ",";
    }
  }

  const rows: Array<{ cells: string[]; line: number }> = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let currentLine = 1;
  let rowStartLine = 1;
  let quoteStartLine = 1;

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        if (char === "\n") {
          currentLine++;
        }
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        quoteStartLine = currentLine;
        i++;
        continue;
      }
      if (char === delimiter) {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      }
      if (char === "\n") {
        currentRow.push(currentField);
        rows.push({ cells: currentRow, line: rowStartLine });
        currentRow = [];
        currentField = "";
        currentLine++;
        rowStartLine = currentLine;
        i++;
        continue;
      }
      currentField += char;
      i++;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push({ cells: currentRow, line: rowStartLine });
  }

  return {
    rows,
    hasUnclosedQuote: insideQuotes,
    unclosedQuoteLine: insideQuotes ? quoteStartLine : undefined,
  };
}

/**
 * Standard CSV and TSV tokenizer helper that returns string[][] for backwards compatibility.
 */
export function parseDelimitedText(
  rawText: string,
  preferredDelimiter?: "," | "\t" | ";"
): string[][] {
  const result = tokenizeDelimitedText(rawText, preferredDelimiter);
  return result.rows.map((r) => r.cells);
}

/**
 * Normalizes header string to match known aliases.
 */
function normalizeHeaderName(header: string): string {
  return header.trim().toLowerCase();
}

/**
 * Parses CSV/TSV input into BulkCreateRowInput array with mapped headers,
 * strict validation, comprehensive statistics, and unique clientRef generation.
 */
export function parseBulkCreateCsv(
  csvContent: string,
  preferredDelimiter?: "," | "\t" | ";",
  maxItems: number = MAX_BULK_CREATE_ITEMS
): ParsedCsvResult {
  const tokenized = tokenizeDelimitedText(csvContent, preferredDelimiter);
  const warnings: string[] = [];
  const errors: ParsedCsvRowError[] = [];

  if (tokenized.hasUnclosedQuote) {
    warnings.push(
      `Phát hiện dấu ngoặc kép (quote) chưa được đóng ở dòng ${tokenized.unclosedQuoteLine ?? "cuối"}. Dữ liệu có thể bị gộp dòng.`
    );
  }

  const hasAnyContent = tokenized.rows.some((r) =>
    r.cells.some((c) => c.trim().length > 0)
  );

  if (tokenized.rows.length === 0 || !hasAnyContent) {
    return {
      items: [],
      headers: [],
      recognizedHeaders: {},
      unrecognizedHeaders: [],
      duplicateCanonicalHeaders: [],
      totalRows: 0,
      validCount: 0,
      errorCount: 0,
      skippedEmptyCount: tokenized.rows.length,
      overflowCount: 0,
      errors: [],
      warnings: ["Tệp hoặc dữ liệu trống"],
    };
  }

  const headerRow = tokenized.rows[0];
  const rawHeaders = headerRow.cells.map((h) => h.trim());
  const recognizedHeaders: Record<string, string> = {};
  const unrecognizedHeaders: string[] = [];
  const duplicateCanonicalHeaders: string[] = [];
  const canonicalToHeaderMap: Map<keyof BulkCreateRowInput, string> = new Map();
  const columnIndexMap: Map<number, keyof BulkCreateRowInput> = new Map();

  let hasSummaryHeader = false;
  rawHeaders.forEach((header, idx) => {
    const norm = normalizeHeaderName(header);
    const mapped = CANONICAL_FIELD_MAP[norm];
    if (mapped) {
      if (canonicalToHeaderMap.has(mapped)) {
        const prev = canonicalToHeaderMap.get(mapped);
        duplicateCanonicalHeaders.push(header);
        warnings.push(
          `Cột "${header}" bị trùng với cột "${prev}" cho trường "${mapped}". Cột "${header}" sẽ được ưu tiên.`
        );
      }
      canonicalToHeaderMap.set(mapped, header);
      recognizedHeaders[header] = mapped;
      columnIndexMap.set(idx, mapped);
      if (mapped === "summary") hasSummaryHeader = true;
    } else if (header.length > 0) {
      unrecognizedHeaders.push(header);
    }
  });

  // Check if header is missing summary when other headers are recognized
  let dataRowsWithLine = tokenized.rows.slice(1);
  if (!hasSummaryHeader) {
    if (columnIndexMap.size > 0) {
      // Missing mandatory summary header while having other recognized headers
      errors.push({
        line: 1,
        field: "summary",
        message: 'Tệp thiếu cột bắt buộc "summary" (Tiêu đề). Không thể nhập dữ liệu.',
      });
      return {
        items: [],
        headers: rawHeaders,
        recognizedHeaders,
        unrecognizedHeaders,
        duplicateCanonicalHeaders,
        totalRows: dataRowsWithLine.length,
        validCount: 0,
        errorCount: dataRowsWithLine.length,
        skippedEmptyCount: 0,
        overflowCount: 0,
        errors,
        warnings,
      };
    } else {
      // No recognized headers at all (e.g. user pasted raw table without header)
      warnings.push("Không tìm thấy hàng tiêu đề nhận diện được. Cột 1 sẽ được coi là Tiêu đề (Summary).");
      columnIndexMap.set(0, "summary");
      dataRowsWithLine = tokenized.rows;
    }
  }

  const items: BulkCreateRowInput[] = [];
  const seenRefs = new Set<string>();
  let validCount = 0;
  let errorCount = 0;
  let skippedEmptyCount = 0;
  let overflowCount = 0;

  dataRowsWithLine.forEach((rowObj) => {
    const row = rowObj.cells;
    const rowLine = rowObj.line;

    // Check if entire row is empty
    const isRowEmpty = row.every((c) => c.trim().length === 0);
    if (isRowEmpty) {
      skippedEmptyCount++;
      return;
    }

    let clientRef = "";
    let summary = "";
    let issueTypeId: string | undefined;
    let description: string | undefined;
    let assignee: string | null | undefined;
    let priorityId: string | undefined;
    let labels: string[] | undefined;
    let points: number | null | undefined;
    let originalEstimate: string | undefined;
    let dueDate: string | null | undefined;
    let fixVersionIds: string[] | undefined;
    const rowErrors: string[] = [];

    row.forEach((cell, colIdx) => {
      const field = columnIndexMap.get(colIdx);
      if (!field) return;

      const trimmed = cell.trim();
      switch (field) {
        case "clientRef":
          if (trimmed) clientRef = trimmed;
          break;
        case "summary":
          summary = trimmed;
          break;
        case "issueTypeId":
          if (trimmed) issueTypeId = trimmed;
          break;
        case "description":
          if (trimmed) description = trimmed;
          break;
        case "assignee":
          assignee = trimmed || null;
          break;
        case "priorityId":
          if (trimmed) priorityId = trimmed;
          break;
        case "labels":
          if (trimmed) {
            labels = trimmed
              .split(/[,;\s]+/)
              .map((l) => l.trim())
              .filter(Boolean);
          }
          break;
        case "points":
          if (trimmed) {
            const parsed = parseStrictPoints(trimmed);
            if (parsed.ok) {
              points = parsed.points;
            } else {
              rowErrors.push(`Points "${trimmed}" không hợp lệ (phải là số nguyên không âm)`);
            }
          }
          break;
        case "originalEstimate":
          if (trimmed) originalEstimate = trimmed;
          break;
        case "dueDate":
          if (trimmed) {
            if (isValidIsoDate(trimmed)) {
              dueDate = trimmed;
            } else {
              rowErrors.push(`Hạn chót "${trimmed}" không đúng định dạng YYYY-MM-DD hoặc ngày không tồn tại`);
            }
          }
          break;
        case "fixVersionIds":
          if (trimmed) {
            fixVersionIds = trimmed
              .split(/[,;]+/)
              .map((v) => v.trim())
              .filter(Boolean);
          }
          break;
      }
    });

    // Check mandatory summary
    if (!summary) {
      rowErrors.push("Thiếu tiêu đề (Summary)");
    }

    if (rowErrors.length > 0) {
      errorCount++;
      for (const err of rowErrors) {
        errors.push({ line: rowLine, message: `Dòng ${rowLine}: ${err}` });
      }
      return;
    }

    // Resolve or generate unique clientRef
    if (!clientRef) {
      clientRef = generateUniqueClientRef(seenRefs, "row");
    } else if (seenRefs.has(clientRef)) {
      warnings.push(`Dòng ${rowLine}: clientRef "${clientRef}" bị trùng lặp, đã tự động đổi tên.`);
      let dupIndex = 2;
      let newRef = `${clientRef}-${dupIndex}`;
      while (seenRefs.has(newRef)) {
        dupIndex++;
        newRef = `${clientRef}-${dupIndex}`;
      }
      clientRef = newRef;
      seenRefs.add(clientRef);
    } else {
      seenRefs.add(clientRef);
    }

    // Check capacity limit
    if (items.length >= maxItems) {
      overflowCount++;
      return;
    }

    items.push({
      clientRef,
      summary,
      issueTypeId,
      description,
      assignee,
      priorityId,
      labels,
      points,
      originalEstimate,
      dueDate,
      fixVersionIds,
    });
    validCount++;
  });

  if (overflowCount > 0) {
    warnings.push(
      `Có ${overflowCount} dòng vượt quá giới hạn tối đa ${maxItems} task và đã bị bỏ qua.`
    );
  }

  return {
    items,
    headers: rawHeaders,
    recognizedHeaders,
    unrecognizedHeaders,
    duplicateCanonicalHeaders,
    totalRows: dataRowsWithLine.length,
    validCount,
    errorCount,
    skippedEmptyCount,
    overflowCount,
    errors,
    warnings,
  };
}
