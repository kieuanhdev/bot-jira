import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_SUMMARY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/bulk/create-types";

export interface CellIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface RowValidationResult {
  rowIndex: number;
  errors: CellIssue[];
  warnings: CellIssue[];
  isValid: boolean;
}

export function validateRow(
  row: BulkCreateRowInput,
  rowIndex: number,
  defaults: BulkCreateFieldDefaults,
  metadata: BulkCreateProjectMetadata
): RowValidationResult {
  const errors: CellIssue[] = [];
  const warnings: CellIssue[] = [];

  const summary = row.summary.trim();
  const subtaskTypeIds = new Set(
    metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id)
  );

  // Summary validation
  if (!summary) {
    errors.push({
      field: "summary",
      message: "Tiêu đề không được để trống",
      severity: "error",
    });
  } else if (summary.length > MAX_SUMMARY_LENGTH) {
    errors.push({
      field: "summary",
      message: `Tiêu đề quá dài (${summary.length}/${MAX_SUMMARY_LENGTH} ký tự)`,
      severity: "error",
    });
  }

  // Issue Type validation
  const effectiveIssueTypeId = row.issueTypeId || defaults.issueTypeId || metadata.defaultIssueTypeId;
  if (!effectiveIssueTypeId) {
    errors.push({
      field: "issueTypeId",
      message: "Vui lòng chọn loại task",
      severity: "error",
    });
  } else if (subtaskTypeIds.has(effectiveIssueTypeId)) {
    // If it's a subtask, it MUST have a parent
    if (!row.parent) {
      errors.push({
        field: "parent",
        message: "Sub-task yêu cầu chỉ định Task cha",
        severity: "error",
      });
    }
  }

  // Points validation
  if (row.points != null && row.points < 0) {
    errors.push({
      field: "points",
      message: "Points không thể là số âm",
      severity: "error",
    });
  }

  // Estimate format validation (warning)
  if (row.originalEstimate) {
    const trimmedEst = row.originalEstimate.trim();
    const estimatePattern = /^(\d+[wdhm]\s*)+$/i;
    if (!estimatePattern.test(trimmedEst)) {
      warnings.push({
        field: "originalEstimate",
        message: "Định dạng ước tính nên là dạng: 2d 4h 30m",
        severity: "warning",
      });
    }
  }

  // Description validation
  if (row.description && row.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({
      field: "description",
      message: `Mô tả vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự`,
      severity: "error",
    });
  }

  return {
    rowIndex,
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

export function validateAllRows(
  items: BulkCreateRowInput[],
  defaults: BulkCreateFieldDefaults,
  metadata: BulkCreateProjectMetadata
): {
  rowResults: RowValidationResult[];
  totalErrors: number;
  totalWarnings: number;
  validRowCount: number;
  firstErrorRowIndex: number | null;
} {
  let totalErrors = 0;
  let totalWarnings = 0;
  let validRowCount = 0;
  let firstErrorRowIndex: number | null = null;

  const rowResults = items.map((row, idx) => {
    // If the row is totally blank and there are other rows, we still report summary missing if user filled others
    const res = validateRow(row, idx, defaults, metadata);
    totalErrors += res.errors.length;
    totalWarnings += res.warnings.length;
    if (res.isValid) {
      validRowCount++;
    } else if (firstErrorRowIndex === null) {
      firstErrorRowIndex = idx;
    }
    return res;
  });

  return {
    rowResults,
    totalErrors,
    totalWarnings,
    validRowCount,
    firstErrorRowIndex,
  };
}
