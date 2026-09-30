import {
  type BulkCreateRequest,
  type BulkCreateFieldDefaults,
  type BulkCreateRowInput,
  type CanonicalCreateItem,
  type BulkCreatePreviewItem,
  type BulkCreateValidationError,
  type BulkCreateValidationWarning,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
  MAX_DESCRIPTION_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LABELS_COUNT,
} from "./create-types";
import { parseJiraDuration } from "@/lib/worklogs/schema";

export type BatchValidationResult =
  | { ok: true; data: BulkCreateRequest }
  | { ok: false; errors: Array<{ field?: string; message: string }> };

export function validateBulkCreateBatch(raw: unknown): BatchValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: [{ message: "Payload must be a JSON object" }] };
  }

  const body = raw as Partial<BulkCreateRequest>;
  const errors: Array<{ field?: string; message: string }> = [];

  const projectKey = typeof body.projectKey === "string" ? body.projectKey.trim().toUpperCase() : "";
  if (!projectKey) {
    errors.push({ field: "projectKey", message: "Mã dự án (projectKey) là bắt buộc" });
  } else if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(projectKey)) {
    errors.push({ field: "projectKey", message: "Mã dự án không hợp lệ" });
  }

  if (!Array.isArray(body.items)) {
    errors.push({ field: "items", message: "Danh sách items phải là một mảng" });
  } else if (body.items.length === 0) {
    errors.push({ field: "items", message: "Danh sách items không được để trống" });
  } else if (body.items.length > MAX_BULK_CREATE_ITEMS) {
    errors.push({
      field: "items",
      message: `Số lượng task tối đa cho mỗi batch là ${MAX_BULK_CREATE_ITEMS} (gửi lên ${body.items.length})`,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Validate clientRef uniqueness
  const clientRefs = new Set<string>();
  const items = (body.items || []).map((item, idx) => {
    let clientRef = typeof item.clientRef === "string" ? item.clientRef.trim() : "";
    if (!clientRef) {
      clientRef = `row-${idx + 1}`;
    }
    if (clientRefs.has(clientRef)) {
      errors.push({
        field: `items[${idx}].clientRef`,
        message: `clientRef "${clientRef}" bị trùng lặp trong batch`,
      });
    }
    clientRefs.add(clientRef);

    return {
      ...item,
      clientRef,
      summary: typeof item.summary === "string" ? item.summary.trim() : "",
    };
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      projectKey,
      defaults: body.defaults,
      items,
      metadataFingerprint: body.metadataFingerprint,
      source: body.source,
    },
  };
}

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
    description: row.description !== undefined ? row.description : defaults.description,
    assignee: row.assignee !== undefined ? row.assignee : defaults.assignee,
    priorityId: row.priorityId !== undefined ? row.priorityId : defaults.priorityId,
    labels: row.labels !== undefined ? row.labels : defaults.labels,
    points: row.points !== undefined ? row.points : defaults.points,
    originalEstimate:
      row.originalEstimate !== undefined ? row.originalEstimate : defaults.originalEstimate,
    dueDate: row.dueDate !== undefined ? row.dueDate : defaults.dueDate,
    fixVersionIds: row.fixVersionIds !== undefined ? row.fixVersionIds : defaults.fixVersionIds,
  };
}

/**
 * Validate and normalize a single item against project metadata.
 */
export function validateAndNormalizeItem(
  rawItem: BulkCreateRowInput,
  rowIndex: number,
  defaults: BulkCreateFieldDefaults | undefined,
  meta: BulkCreateProjectMetadata
): BulkCreatePreviewItem {
  const merged = mergeDefaultsWithRow(rawItem, defaults);
  const errors: BulkCreateValidationError[] = [];
  const warnings: BulkCreateValidationWarning[] = [];

  // 1. Summary validation
  const summary = (merged.summary ?? "").trim();
  if (!summary) {
    errors.push({ field: "summary", code: "SUMMARY_REQUIRED", message: "Tiêu đề không được để trống" });
  } else if (summary.length > MAX_SUMMARY_LENGTH) {
    errors.push({
      field: "summary",
      code: "SUMMARY_TOO_LONG",
      message: `Tiêu đề quá dài (tối đa ${MAX_SUMMARY_LENGTH} ký tự)`,
    });
  }

  // 2. Issue Type validation
  let issueTypeId = (merged.issueTypeId ?? "").trim();
  if (!issueTypeId) {
    errors.push({
      field: "issueTypeId",
      code: "ISSUE_TYPE_REQUIRED",
      message: "Loại công việc (Issue Type) là bắt buộc",
    });
  } else {
    // Check if issueTypeId is an ID or Name
    const matchedType = meta.issueTypes.find(
      (t) => t.id === issueTypeId || t.name.toLowerCase() === issueTypeId.toLowerCase()
    );
    if (!matchedType) {
      errors.push({
        field: "issueTypeId",
        code: "INVALID_ISSUE_TYPE",
        message: `Loại công việc "${issueTypeId}" không tồn tại trong dự án`,
      });
    } else if (matchedType.subtask) {
      errors.push({
        field: "issueTypeId",
        code: "SUBTASK_NOT_SUPPORTED",
        message: `Sub-task ("${matchedType.name}") chưa được hỗ trợ trong phiên bản này`,
      });
    } else {
      issueTypeId = matchedType.id; // normalize to ID
    }
  }

  // 3. Description validation
  let description: string | undefined = undefined;
  if (merged.description !== undefined && merged.description !== null) {
    const descStr = String(merged.description);
    if (descStr.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: "description",
        code: "DESCRIPTION_TOO_LONG",
        message: `Mô tả vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự`,
      });
    } else if (descStr.trim().length > 0) {
      description = descStr;
    }
  }

  // 4. Assignee validation
  let assignee: string | null = null;
  if (merged.assignee) {
    assignee = merged.assignee.trim();
  }

  // 5. Priority validation
  let priorityId: string | undefined = undefined;
  if (merged.priorityId) {
    const pTrim = merged.priorityId.trim();
    const matchedPriority = meta.priorityOptions.find(
      (p) => p.id === pTrim || p.name.toLowerCase() === pTrim.toLowerCase()
    );
    if (matchedPriority) {
      priorityId = matchedPriority.id;
    } else {
      warnings.push({
        field: "priorityId",
        code: "UNKNOWN_PRIORITY",
        message: `Mức ưu tiên "${pTrim}" không tìm thấy, sẽ dùng mặc định của Jira`,
      });
    }
  }

  // 6. Labels validation
  const labelsSet = new Set<string>();
  if (Array.isArray(merged.labels)) {
    for (const rawLabel of merged.labels) {
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
  const labels = Array.from(labelsSet);

  // 7. Points validation
  let points: number | null | undefined = undefined;
  if (merged.points !== undefined && merged.points !== null) {
    const pVal = Number(merged.points);
    if (!Number.isFinite(pVal) || pVal < 0 || !Number.isInteger(pVal)) {
      errors.push({
        field: "points",
        code: "INVALID_POINTS",
        message: "Story Points phải là số nguyên không âm",
      });
    } else {
      points = pVal;
      if (!meta.pointsFieldId) {
        warnings.push({
          field: "points",
          code: "POINTS_FIELD_UNAVAILABLE",
          message: "Dự án không có trường Story Points, giá trị này sẽ bị bỏ qua khi tạo",
        });
      }
    }
  }

  // 8. Original Estimate validation
  let originalEstimate: string | undefined = undefined;
  let originalEstimateSeconds: number | undefined = undefined;
  if (merged.originalEstimate) {
    const estTrim = merged.originalEstimate.trim();
    const parsedSecs = parseJiraDuration(estTrim);
    if (parsedSecs === null || parsedSecs <= 0) {
      errors.push({
        field: "originalEstimate",
        code: "INVALID_ESTIMATE",
        message: `Định dạng thời gian ước tính "${estTrim}" không hợp lệ (ví dụ: 1d 4h, 30m)`,
      });
    } else {
      originalEstimate = estTrim;
      originalEstimateSeconds = parsedSecs;
      if (!meta.supportsTimeTracking) {
        warnings.push({
          field: "originalEstimate",
          code: "TIMETRACKING_UNAVAILABLE",
          message: "Dự án không bật tính năng Time Tracking",
        });
      }
    }
  }

  // 9. Due Date validation
  let dueDate: string | null | undefined = undefined;
  if (merged.dueDate) {
    const dTrim = merged.dueDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dTrim)) {
      errors.push({
        field: "dueDate",
        code: "INVALID_DUEDATE",
        message: "Hạn hoàn thành phải có định dạng YYYY-MM-DD",
      });
    } else {
      const d = new Date(dTrim + "T00:00:00Z");
      if (Number.isNaN(d.getTime())) {
        errors.push({
          field: "dueDate",
          code: "INVALID_DUEDATE_VALUE",
          message: "Ngày hết hạn không hợp lệ",
        });
      } else {
        dueDate = dTrim;
      }
    }
  }

  // 10. Fix Versions validation
  const fixVersionIds: string[] = [];
  if (Array.isArray(merged.fixVersionIds)) {
    for (const v of merged.fixVersionIds) {
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

  // 11. Check required fields for this issue type from metadata
  if (issueTypeId && meta.fieldsByIssueType[issueTypeId]) {
    const requiredFields = meta.fieldsByIssueType[issueTypeId].filter((f) => f.required);
    for (const reqField of requiredFields) {
      if (reqField.id === "summary" && !summary) continue; // already checked
      if (reqField.id === "issuetype") continue; // already checked
      if (reqField.id === "project") continue; // handled at batch level

      if (reqField.id === "description" && !description) {
        errors.push({
          field: "description",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
      } else if (reqField.id === "duedate" && !dueDate) {
        errors.push({
          field: "dueDate",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
      } else if (reqField.id === "priority" && !priorityId) {
        errors.push({
          field: "priorityId",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
      }
    }
  }

  const classification: "ready" | "blocked" = errors.length === 0 ? "ready" : "blocked";

  const normalizedFields: Partial<CanonicalCreateItem> = {
    clientRef: rawItem.clientRef,
    summary,
    issueTypeId,
    description,
    assignee,
    priorityId,
    labels,
    points,
    originalEstimate,
    originalEstimateSeconds,
    dueDate,
    fixVersionIds,
  };

  return {
    rowIndex,
    clientRef: rawItem.clientRef,
    summary: rawItem.summary || summary,
    classification,
    warnings,
    errors,
    normalizedFields,
  };
}

/**
 * Generate a stable idempotency marker to identify created issue in Jira:
 * ttw-bulk-<shortOpId>-<rowIndex>
 */
export function generateBulkCreateMarker(operationId: string, rowIndex: number): string {
  const shortId = operationId.slice(-8);
  return `ttw-bulk-${shortId}-${rowIndex}`;
}
