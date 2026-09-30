import {
  type BulkCreateRowInput,
  MAX_BULK_CREATE_ITEMS,
} from "./create-types";

export type ParsedCsvResult = {
  items: BulkCreateRowInput[];
  headers: string[];
  recognizedHeaders: Record<string, string>; // rawHeader -> canonicalField
  unrecognizedHeaders: string[];
  totalRows: number;
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
 * Standard CSV and TSV tokenizer that handles quotes, escaped quotes (""), and newlines.
 */
export function parseDelimitedText(
  rawText: string,
  preferredDelimiter?: "," | "\t" | ";"
): string[][] {
  let text = rawText;
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Autodetect delimiter if not specified: count occurrences in first line
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

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
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
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
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
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }
      currentField += char;
      i++;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Filter out trailing empty rows
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/**
 * Normalizes header string to match known aliases.
 */
function normalizeHeaderName(header: string): string {
  return header.trim().toLowerCase();
}

/**
 * Parses CSV/TSV input into BulkCreateRowInput array with mapped headers and generated clientRef.
 */
export function parseBulkCreateCsv(
  csvContent: string,
  preferredDelimiter?: "," | "\t" | ";"
): ParsedCsvResult {
  const rows = parseDelimitedText(csvContent, preferredDelimiter);
  const warnings: string[] = [];

  if (rows.length === 0) {
    return {
      items: [],
      headers: [],
      recognizedHeaders: {},
      unrecognizedHeaders: [],
      totalRows: 0,
      warnings: ["Tệp hoặc dữ liệu trống"],
    };
  }

  const rawHeaders = rows[0].map((h) => h.trim());
  const recognizedHeaders: Record<string, string> = {};
  const unrecognizedHeaders: string[] = [];
  const columnIndexMap: Map<number, keyof BulkCreateRowInput> = new Map();

  let hasSummaryHeader = false;
  rawHeaders.forEach((header, idx) => {
    const norm = normalizeHeaderName(header);
    const mapped = CANONICAL_FIELD_MAP[norm];
    if (mapped) {
      recognizedHeaders[header] = mapped;
      columnIndexMap.set(idx, mapped);
      if (mapped === "summary") hasSummaryHeader = true;
    } else if (header.length > 0) {
      unrecognizedHeaders.push(header);
    }
  });

  // If no recognized headers found (e.g. user pasted raw table without header),
  // treat row 0 as data if row 0 has content and doesn't look like header
  let dataRows = rows.slice(1);
  if (!hasSummaryHeader && columnIndexMap.size === 0) {
    // Check if column 0 might be summary
    warnings.push("Không tìm thấy hàng tiêu đề nhận diện được. Cột 1 sẽ được coi là Tiêu đề (Summary).");
    columnIndexMap.set(0, "summary");
    dataRows = rows;
  }

  const items: BulkCreateRowInput[] = [];

  dataRows.forEach((row, rowIdx) => {
    if (items.length >= MAX_BULK_CREATE_ITEMS) return;

    let clientRef = `row-${rowIdx + 1}`;
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
            const p = parseFloat(trimmed);
            if (!Number.isNaN(p)) points = Math.round(p);
          }
          break;
        case "originalEstimate":
          if (trimmed) originalEstimate = trimmed;
          break;
        case "dueDate":
          if (trimmed) dueDate = trimmed;
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

    if (summary || description || issueTypeId) {
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
    }
  });

  if (dataRows.length > MAX_BULK_CREATE_ITEMS) {
    warnings.push(`Dữ liệu gồm ${dataRows.length} dòng, chỉ ${MAX_BULK_CREATE_ITEMS} dòng đầu tiên được nhập.`);
  }

  return {
    items,
    headers: rawHeaders,
    recognizedHeaders,
    unrecognizedHeaders,
    totalRows: items.length,
    warnings,
  };
}
