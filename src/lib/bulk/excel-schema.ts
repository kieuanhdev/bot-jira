/**
 * Schema and contract definitions for Bulk Create Excel templates and imports.
 * Reference: docs/BULK_CREATE_EXCEL_TEMPLATE_PLAN.md
 */

import { type BulkCreateProjectMetadata, type BulkCreateRowInput } from "./create-types";

export const EXCEL_SCHEMA_VERSION = 1;
export const MAX_EXCEL_ITEMS = 100;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const SHEET_NAME_TASKS = "Tasks";
export const SHEET_NAME_CATALOG = "Danh_muc";
export const SHEET_NAME_GUIDE = "Huong_dan";

export interface ExcelTemplateManifest {
  schemaVersion: number;
  projectKey: string;
  projectName?: string;
  generatedAt: string;
  metadataFingerprint: string;
  maxItems: number;
}

export type CanonicalExcelColumn =
  | "clientRef"
  | "summary"
  | "issueTypeId"
  | "parentRef"
  | "parentKey"
  | "description"
  | "assignee"
  | "priorityId"
  | "labels"
  | "points"
  | "originalEstimate"
  | "dueDate"
  | "fixVersionIds";

export interface ExcelColumnDef {
  key: CanonicalExcelColumn;
  header: string;
  required: boolean;
  width: number;
  comment?: string;
  example?: string;
  dropdownCatalogKey?: "issueTypes" | "priorities" | "assignees" | "fixVersions";
  dataType?: "text" | "number" | "date" | "dropdown";
}

/**
 * Standard column definitions for the `Tasks` sheet.
 */
export const EXCEL_COLUMN_DEFINITIONS: ExcelColumnDef[] = [
  {
    key: "clientRef",
    header: "Client Ref *",
    required: true,
    width: 16,
    comment: "Mã định danh duy nhất của dòng trong file (vd: TASK-001). Không được trùng nhau.",
    example: "TASK-001",
    dataType: "text",
  },
  {
    key: "summary",
    header: "Summary *",
    required: true,
    width: 40,
    comment: "Tiêu đề task (tối đa 255 ký tự). Bắt buộc phải có nội dung.",
    example: "Phát triển tính năng nhập Excel",
    dataType: "text",
  },
  {
    key: "issueTypeId",
    header: "Issue Type *",
    required: true,
    width: 24,
    comment: "Loại issue. Chọn từ dropdown (vd: Task [10001], Sub-task [10002]).",
    example: "Task [10001]",
    dropdownCatalogKey: "issueTypes",
    dataType: "dropdown",
  },
  {
    key: "parentRef",
    header: "Parent Ref",
    required: false,
    width: 18,
    comment: "Client Ref của task cha TRONG CÙNG FILE (chỉ dùng cho Sub-task, vd: TASK-001). Không điền cùng Parent Jira Key.",
    example: "TASK-001",
    dataType: "text",
  },
  {
    key: "parentKey",
    header: "Parent Jira Key",
    required: false,
    width: 20,
    comment: "Key của issue cha ĐÃ CÓ SẴN TRÊN JIRA (vd: PROJ-123). Không điền cùng Parent Ref.",
    example: "PROJ-123",
    dataType: "text",
  },
  {
    key: "description",
    header: "Description",
    required: false,
    width: 45,
    comment: "Mô tả chi tiết nội dung task (cho phép xuống dòng).",
    example: "Chi tiết yêu cầu kỹ thuật...",
    dataType: "text",
  },
  {
    key: "assignee",
    header: "Assignee",
    required: false,
    width: 30,
    comment: "Người thực hiện. Chọn từ dropdown hoặc nhập username Jira.",
    example: "Nguyễn Văn A [nguyenvana]",
    dropdownCatalogKey: "assignees",
    dataType: "dropdown",
  },
  {
    key: "priorityId",
    header: "Priority",
    required: false,
    width: 20,
    comment: "Mức độ ưu tiên. Chọn từ dropdown (vd: High [3], Medium [4]).",
    example: "Medium [4]",
    dropdownCatalogKey: "priorities",
    dataType: "dropdown",
  },
  {
    key: "labels",
    header: "Labels",
    required: false,
    width: 26,
    comment: "Nhãn phân loại, phân cách bằng dấu phẩy nếu có nhiều nhãn (vd: backend, excel, sprint-1).",
    example: "frontend, mobile",
    dataType: "text",
  },
  {
    key: "points",
    header: "Story Points",
    required: false,
    width: 16,
    comment: "Điểm độ phức tạp (số nguyên không âm: 1, 2, 3, 5, 8,...).",
    example: "3",
    dataType: "number",
  },
  {
    key: "originalEstimate",
    header: "Original Estimate",
    required: false,
    width: 20,
    comment: "Ước lượng thời gian theo cú pháp Jira (vd: 1d 4h, 2h 30m).",
    example: "1d 4h",
    dataType: "text",
  },
  {
    key: "dueDate",
    header: "Due Date",
    required: false,
    width: 18,
    comment: "Hạn hoàn thành định dạng YYYY-MM-DD (vd: 2026-10-15).",
    example: "2026-10-15",
    dataType: "date",
  },
  {
    key: "fixVersionIds",
    header: "Fix Versions",
    required: false,
    width: 26,
    comment: "Phiên bản phát hành. Chọn từ dropdown hoặc nhập tên phiên bản.",
    example: "Release 1.0 [10420]",
    dropdownCatalogKey: "fixVersions",
    dataType: "dropdown",
  },
];

/**
 * Filter columns to include in the Excel template based on project capabilities.
 */
export function getActiveColumnsForProject(metadata: BulkCreateProjectMetadata): ExcelColumnDef[] {
  return EXCEL_COLUMN_DEFINITIONS.filter((col) => {
    if (col.key === "priorityId") {
      return metadata.priorityOptions.length > 0;
    }
    if (col.key === "fixVersionIds") {
      return metadata.versionOptions.length > 0;
    }
    if (col.key === "points") {
      return Boolean(metadata.pointsFieldId);
    }
    if (col.key === "originalEstimate") {
      return metadata.supportsTimeTracking;
    }
    if (col.key === "dueDate") {
      return metadata.supportsDueDate;
    }
    return true;
  });
}

/**
 * Flexible header recognition mapping (Vietnamese, English, normalized strings).
 */
export const EXCEL_HEADER_ALIASES: Record<string, CanonicalExcelColumn> = {
  // Client Ref
  clientref: "clientRef",
  "client ref": "clientRef",
  "client ref *": "clientRef",
  "clientref*": "clientRef",
  ref: "clientRef",
  id: "clientRef",
  "mã": "clientRef",
  "mã tham chiếu": "clientRef",
  "mã ref": "clientRef",

  // Summary
  summary: "summary",
  "summary *": "summary",
  "summary*": "summary",
  title: "summary",
  "tiêu đề": "summary",
  "tiêu đề *": "summary",
  "tóm tắt": "summary",

  // Issue Type
  issuetype: "issueTypeId",
  "issue type": "issueTypeId",
  "issue type *": "issueTypeId",
  "issuetype*": "issueTypeId",
  type: "issueTypeId",
  "loại": "issueTypeId",
  "loại task": "issueTypeId",
  "loại issue": "issueTypeId",

  // Parent Ref
  parentref: "parentRef",
  "parent ref": "parentRef",
  "task cha": "parentRef",
  "task cha (ref)": "parentRef",
  "parent trong batch": "parentRef",

  // Parent Jira Key
  parentkey: "parentKey",
  "parent key": "parentKey",
  "parent jira key": "parentKey",
  "parent jira": "parentKey",
  "jira key cha": "parentKey",

  // Description
  description: "description",
  desc: "description",
  "mô tả": "description",
  "chi tiết": "description",

  // Assignee
  assignee: "assignee",
  assign: "assignee",
  "người thực hiện": "assignee",
  "gán cho": "assignee",
  user: "assignee",

  // Priority
  priority: "priorityId",
  priorities: "priorityId",
  "độ ưu tiên": "priorityId",
  "mức độ ưu tiên": "priorityId",
  "mức ưu tiên": "priorityId",

  // Labels
  labels: "labels",
  label: "labels",
  tags: "labels",
  tag: "labels",
  "nhãn": "labels",

  // Points
  points: "points",
  point: "points",
  "story points": "points",
  storypoints: "points",
  "task points": "points",
  "điểm": "points",
  "điểm story": "points",

  // Original Estimate
  originalestimate: "originalEstimate",
  "original estimate": "originalEstimate",
  estimate: "originalEstimate",
  "thời gian ước tính": "originalEstimate",
  "ước tính": "originalEstimate",

  // Due Date
  duedate: "dueDate",
  "due date": "dueDate",
  due: "dueDate",
  "hạn chót": "dueDate",
  "hạn hoàn thành": "dueDate",
  "ngày hết hạn": "dueDate",

  // Fix Versions
  fixversions: "fixVersionIds",
  "fix versions": "fixVersionIds",
  fixversion: "fixVersionIds",
  versions: "fixVersionIds",
  version: "fixVersionIds",
  "phiên bản": "fixVersionIds",
};

/**
 * Normalizes header string to find canonical column key.
 */
export function normalizeExcelHeader(rawHeader: string): CanonicalExcelColumn | null {
  if (!rawHeader) return null;
  const cleaned = rawHeader.trim().toLowerCase().replace(/\s+/g, " ");
  if (EXCEL_HEADER_ALIASES[cleaned]) {
    return EXCEL_HEADER_ALIASES[cleaned];
  }
  // Strip trailing asterisk if present
  const withoutAsterisk = cleaned.replace(/\s*\*$/, "").trim();
  if (EXCEL_HEADER_ALIASES[withoutAsterisk]) {
    return EXCEL_HEADER_ALIASES[withoutAsterisk];
  }
  return null;
}

/**
 * Helper to extract ID from formatted dropdown values: "Name [ID]" -> ID
 */
export function extractIdFromDropdownValue(value: string): { name: string; id: string | null } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)\s*\[([^\]]+)\]$/);
  if (match) {
    return {
      name: match[1].trim(),
      id: match[2].trim(),
    };
  }
  return {
    name: trimmed,
    id: null,
  };
}
