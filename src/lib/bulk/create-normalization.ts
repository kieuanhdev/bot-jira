import {
  type BulkCreateFieldDefaults,
  type BulkCreateRowInput,
  type CanonicalCreateItem,
  type BulkCreateValidationError,
  type BulkCreateValidationWarning,
  type BulkCreateProjectMetadata,
  MAX_DESCRIPTION_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LABELS_COUNT,
} from "./create-types";
import { parseJiraDuration } from "@/lib/worklogs/schema";
import { isValidIsoDate } from "./csv-parser";

/**
 * Merge defaults with row overrides according to plan rules:
 * - Row value overrides defaults
 * - Array on item completely replaces defaults
 * - null indicates clear/omit
 * - undefined inherits defaults
 */
export function mergeDefaultsWithRow(
  row: BulkCreateRowInput,
  defaults?: BulkCreateFieldDefaults
): BulkCreateRowInput {
  if (!defaults) return { ...row };

  return {
    clientRef: row.clientRef,
    summary: row.summary,
    issueTypeId: row.issueTypeId !== undefined ? row.issueTypeId : defaults.issueTypeId,
    parent: row.parent,
    description: row.description !== undefined ? row.description : defaults.description,
    assignee: row.assignee !== undefined ? row.assignee : defaults.assignee,
    priorityId: row.priorityId !== undefined ? row.priorityId : defaults.priorityId,
    labels: row.labels !== undefined ? row.labels : defaults.labels,
    points: row.points !== undefined ? row.points : defaults.points,
    originalEstimate:
      row.originalEstimate !== undefined ? row.originalEstimate : defaults.originalEstimate,
    dueDate: row.dueDate !== undefined ? row.dueDate : defaults.dueDate,
    fixVersionIds: row.fixVersionIds !== undefined ? row.fixVersionIds : defaults.fixVersionIds,
    componentIds: row.componentIds !== undefined ? row.componentIds : defaults.componentIds,
    customFields: row.customFields !== undefined ? row.customFields : defaults.customFields,
  };
}

export function normalizeSummary(rawSummary: unknown): {
  summary: string;
  error?: BulkCreateValidationError;
} {
  const summary = typeof rawSummary === "string" ? rawSummary.trim() : "";
  if (!summary) {
    return {
      summary: "",
      error: { field: "summary", code: "SUMMARY_REQUIRED", message: "Tiêu đề không được để trống" },
    };
  }
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return {
      summary,
      error: {
        field: "summary",
        code: "SUMMARY_TOO_LONG",
        message: `Tiêu đề quá dài (tối đa ${MAX_SUMMARY_LENGTH} ký tự)`,
      },
    };
  }
  return { summary };
}

export function normalizeDescription(rawDescription: unknown): {
  description?: string;
  error?: BulkCreateValidationError;
} {
  if (rawDescription === undefined || rawDescription === null) {
    return {};
  }
  const descStr = String(rawDescription);
  if (descStr.length > MAX_DESCRIPTION_LENGTH) {
    return {
      description: descStr,
      error: {
        field: "description",
        code: "DESCRIPTION_TOO_LONG",
        message: `Mô tả vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự`,
      },
    };
  }
  if (descStr.trim().length > 0) {
    return { description: descStr };
  }
  return {};
}

export function normalizeAssignee(rawAssignee: unknown): string | null {
  if (typeof rawAssignee === "string") {
    const trimmed = rawAssignee.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

export function normalizePriority(
  rawPriority: unknown,
  meta: BulkCreateProjectMetadata
): {
  priorityId?: string;
  error?: BulkCreateValidationError;
} {
  if (!rawPriority) return {};
  const pTrim = String(rawPriority).trim();
  if (!pTrim) return {};

  if (meta.priorityOptions.length === 0) {
    // No allowed values from metadata; Jira will use its default.
    return { priorityId: pTrim };
  }

  const matchedPriority = meta.priorityOptions.find(
    (p) => p.id === pTrim || p.name.toLowerCase() === pTrim.toLowerCase()
  );
  if (matchedPriority) {
    return { priorityId: matchedPriority.id };
  }

  return {
    error: {
      field: "priorityId",
      code: "FIELD_VALUE_NOT_ALLOWED",
      message: `Mức ưu tiên "${pTrim}" không nằm trong danh sách được phép của Jira`,
    },
  };
}

export function normalizeLabels(rawLabels: unknown): {
  labels: string[];
  warnings: BulkCreateValidationWarning[];
} {
  const warnings: BulkCreateValidationWarning[] = [];
  const labelsSet = new Set<string>();

  if (Array.isArray(rawLabels)) {
    for (const rawLabel of rawLabels) {
      const clean = String(rawLabel).trim().replace(/\s+/g, "-");
      if (clean) {
        if (clean.length > MAX_LABEL_LENGTH) {
          warnings.push({
            field: "labels",
            code: "LABEL_TOO_LONG",
            message: `Nhãn "${clean}" vượt quá ${MAX_LABEL_LENGTH} ký tự và đã bị cắt bớt`,
          });
          labelsSet.add(clean.slice(0, MAX_LABEL_LENGTH));
        } else {
          labelsSet.add(clean);
        }
      }
      if (labelsSet.size >= MAX_LABELS_COUNT) {
        warnings.push({
          field: "labels",
          code: "TOO_MANY_LABELS",
          message: `Chỉ giữ tối đa ${MAX_LABELS_COUNT} nhãn`,
        });
        break;
      }
    }
  }

  return { labels: Array.from(labelsSet), warnings };
}

export function normalizePoints(
  rawPoints: unknown,
  meta: BulkCreateProjectMetadata
): {
  points?: number | null;
  error?: BulkCreateValidationError;
  warning?: BulkCreateValidationWarning;
} {
  if (rawPoints === undefined || rawPoints === null || rawPoints === "") {
    return {};
  }
  const pVal = Number(rawPoints);
  if (!Number.isFinite(pVal) || pVal < 0 || !Number.isInteger(pVal)) {
    return {
      error: {
        field: "points",
        code: "INVALID_POINTS",
        message: "Story Points phải là số nguyên không âm",
      },
    };
  }

  const warning = !meta.pointsFieldId
    ? {
        field: "points",
        code: "POINTS_FIELD_UNAVAILABLE",
        message: "Dự án không có trường Story Points, giá trị này sẽ bị bỏ qua khi tạo",
      }
    : undefined;

  return { points: pVal, warning };
}

export function normalizeEstimate(
  rawEstimate: unknown,
  meta: BulkCreateProjectMetadata
): {
  originalEstimate?: string;
  originalEstimateSeconds?: number;
  error?: BulkCreateValidationError;
  warning?: BulkCreateValidationWarning;
} {
  if (!rawEstimate) return {};
  const estTrim = String(rawEstimate).trim();
  if (!estTrim) return {};

  const parsedSecs = parseJiraDuration(estTrim);
  if (parsedSecs === null || parsedSecs <= 0) {
    return {
      error: {
        field: "originalEstimate",
        code: "INVALID_ESTIMATE",
        message: `Định dạng thời gian ước tính "${estTrim}" không hợp lệ (ví dụ: 1d 4h, 30m)`,
      },
    };
  }

  const warning = !meta.supportsTimeTracking
    ? {
        field: "originalEstimate",
        code: "TIMETRACKING_UNAVAILABLE",
        message:
          "Dự án không có trường Time Tracking trên màn hình tạo task, Original Estimate sẽ được bỏ qua",
      }
    : undefined;

  return {
    originalEstimate: estTrim,
    originalEstimateSeconds: parsedSecs,
    warning,
  };
}

export function normalizeDueDate(rawDueDate: unknown): {
  dueDate?: string | null;
  error?: BulkCreateValidationError;
} {
  if (!rawDueDate) return {};
  const dTrim = String(rawDueDate).trim();
  if (!dTrim) return {};

  if (!isValidIsoDate(dTrim)) {
    return {
      error: {
        field: "dueDate",
        code: "INVALID_DUEDATE",
        message: "Hạn hoàn thành phải có định dạng YYYY-MM-DD và ngày phải tồn tại trên lịch",
      },
    };
  }
  return { dueDate: dTrim };
}

export function normalizeFixVersions(
  rawVersions: unknown,
  meta: BulkCreateProjectMetadata
): {
  fixVersionIds: string[];
  errors: BulkCreateValidationError[];
} {
  const fixVersionIds: string[] = [];
  const errors: BulkCreateValidationError[] = [];

  if (Array.isArray(rawVersions)) {
    for (const v of rawVersions) {
      const vTrim = String(v).trim();
      if (!vTrim) continue;
      const matched = meta.versionOptions.find(
        (ver) => ver.id === vTrim || ver.name.toLowerCase() === vTrim.toLowerCase()
      );
      if (!matched) {
        errors.push({
          field: "fixVersionIds",
          code: "VERSION_NOT_FOUND",
          message: `Phiên bản "${vTrim}" không thuộc dự án`,
        });
      } else if (matched.archived) {
        errors.push({
          field: "fixVersionIds",
          code: "VERSION_ARCHIVED",
          message: `Phiên bản "${matched.name}" đã được lưu trữ (archived)`,
        });
      } else {
        fixVersionIds.push(matched.id);
      }
    }
  }

  return { fixVersionIds, errors };
}

export function normalizeComponents(
  rawComponents: unknown,
  meta: BulkCreateProjectMetadata
): {
  componentIds: string[];
  errors: BulkCreateValidationError[];
} {
  const componentIds: string[] = [];
  const errors: BulkCreateValidationError[] = [];

  if (Array.isArray(rawComponents)) {
    for (const c of rawComponents) {
      const cTrim = String(c).trim();
      if (!cTrim) continue;
      const matched = (meta.components || []).find(
        (comp) => comp.id === cTrim || comp.name.toLowerCase() === cTrim.toLowerCase()
      );
      if (!matched) {
        errors.push({
          field: "componentIds",
          code: "COMPONENT_NOT_FOUND",
          message: `Hợp phần (Component) "${cTrim}" không thuộc dự án`,
        });
      } else {
        componentIds.push(matched.id);
      }
    }
  }

  return { componentIds, errors };
}

export function normalizeParent(
  rawParent: unknown,
  currentClientRef: string
): {
  parent: CanonicalCreateItem["parent"];
  errors: BulkCreateValidationError[];
} {
  const errors: BulkCreateValidationError[] = [];
  if (!rawParent || typeof rawParent !== "object") {
    return { parent: null, errors };
  }

  const pRef = rawParent as { type?: string; clientRef?: unknown; jiraKey?: unknown };
  if (pRef.type === "batch") {
    const ref = typeof pRef.clientRef === "string" ? pRef.clientRef.trim() : "";
    if (!ref) {
      errors.push({
        field: "parent",
        code: "PARENT_REQUIRED",
        message: "Sub-task phải chọn parent trong batch",
      });
      return { parent: null, errors };
    }
    if (ref === currentClientRef) {
      errors.push({
        field: "parent",
        code: "PARENT_CYCLE",
        message: "Không thể chọn chính task hiện tại làm parent",
      });
      return { parent: null, errors };
    }
    return { parent: { type: "batch", clientRef: ref }, errors };
  }

  if (pRef.type === "jira") {
    const key = typeof pRef.jiraKey === "string" ? pRef.jiraKey.trim().toUpperCase() : "";
    if (!key) {
      errors.push({
        field: "parent",
        code: "PARENT_REQUIRED",
        message: "Sub-task phải chọn parent trên Jira",
      });
      return { parent: null, errors };
    }
    if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
      errors.push({
        field: "parent",
        code: "PARENT_NOT_FOUND",
        message: `Jira key "${pRef.jiraKey}" không hợp lệ (định dạng: PROJECT-123)`,
      });
      return { parent: null, errors };
    }
    return { parent: { type: "jira", jiraKey: key }, errors };
  }

  return { parent: null, errors };
}
