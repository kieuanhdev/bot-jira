import {
  type BulkCreateRequest,
  type BulkCreateFieldDefaults,
  type BulkCreateRowInput,
  type CanonicalCreateItem,
  type BulkCreatePreviewItem,
  type BulkCreateValidationError,
  type BulkCreateValidationWarning,
  type BulkCreateFieldMetadata,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
  MAX_DESCRIPTION_LENGTH,
  MAX_SUMMARY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LABELS_COUNT,
} from "./create-types";
import { parseJiraDuration } from "@/lib/worklogs/schema";
import { isValidIsoDate } from "./csv-parser";

function customFieldScalar(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    for (const key of ["id", "name", "value", "key", "accountId"]) {
      const candidate = objectValue[key];
      if (typeof candidate === "string" || typeof candidate === "number") {
        const trimmed = String(candidate).trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return null;
}

function matchAllowedValue(field: BulkCreateFieldMetadata, value: unknown) {
  const scalar = customFieldScalar(value);
  if (scalar === null) return undefined;
  return field.allowedValues?.find(
    (allowed) => allowed.id === scalar || allowed.name === scalar || allowed.value === scalar
  );
}

export function isAllowedCustomFieldValue(field: BulkCreateFieldMetadata, val: unknown): boolean {
  if (!field.allowedValues || field.allowedValues.length === 0) return true;
  const entries = Array.isArray(val) ? val : [val];
  for (const entry of entries) {
    if (entry === null || entry === undefined || entry === "") continue;
    const scalar = customFieldScalar(entry);
    if (!scalar) return false;
    const matched = field.allowedValues.find(
      (v) => v.id === scalar || v.name === scalar || v.value === scalar
    );
    if (!matched) return false;
  }
  return true;
}

/** Convert editor-friendly scalar values into the shapes expected by Jira REST v2. */
export function normalizeJiraCustomFieldValue(
  field: BulkCreateFieldMetadata | undefined,
  value: unknown
): unknown {
  if (!field || value === undefined || value === null || value === "") return value;

  const normalizeReference = (entry: unknown, referenceType?: string): unknown => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) return entry;
    const scalar = customFieldScalar(entry);
    if (scalar === null) return entry;
    const allowed = matchAllowedValue(field, entry);
    if (referenceType === "user" || referenceType === "group") {
      return { name: allowed?.name ?? allowed?.value ?? scalar };
    }
    return { id: allowed?.id ?? scalar };
  };

  const isMultiUser =
    (field.schemaType === "array" && (field.schemaItems === "user" || field.schemaCustom?.includes("user"))) ||
    Boolean(field.schemaCustom?.includes(":multiuserpicker"));

  const isMultiGroup =
    (field.schemaType === "array" && (field.schemaItems === "group" || field.schemaCustom?.includes("group"))) ||
    Boolean(field.schemaCustom?.includes(":multigrouppicker"));

  const isMultiVersion =
    (field.schemaType === "array" && (field.schemaItems === "version" || field.schemaCustom?.includes("version") || field.schemaSystem === "versions")) ||
    Boolean(field.schemaCustom?.includes(":multiversion"));

  const isArray = field.schemaType === "array" || isMultiUser || isMultiGroup || isMultiVersion;

  if (isArray) {
    let rawEntries: unknown[];
    if (Array.isArray(value)) {
      rawEntries = value;
    } else if (typeof value === "string") {
      rawEntries = value.trim() ? [value.trim()] : [];
    } else {
      rawEntries = [value];
    }
    const filtered = rawEntries.filter((e) => e !== null && e !== undefined && e !== "");
    if (filtered.length === 0) return [];

    if (field.schemaItems === "string" && !isMultiUser && !isMultiGroup) {
      return filtered.map((entry) => String(entry));
    }
    if (isMultiUser || field.schemaItems === "user") {
      return filtered.map((entry) => normalizeReference(entry, "user"));
    }
    if (isMultiGroup || field.schemaItems === "group") {
      return filtered.map((entry) => normalizeReference(entry, "group"));
    }
    if (
      isMultiVersion ||
      field.schemaItems === "version" ||
      field.schemaItems === "component" ||
      field.schemaItems === "option" ||
      field.schemaCustom?.includes("multiselect") ||
      field.schemaCustom?.includes("multicheckboxes") ||
      field.schemaItems ||
      (field.allowedValues && field.allowedValues.length > 0)
    ) {
      return filtered.map((entry) => normalizeReference(entry));
    }
    return filtered;
  }

  // Single references:
  if (field.schemaType === "user" || field.schemaCustom?.includes(":userpicker")) {
    return normalizeReference(value, "user");
  }
  if (field.schemaType === "group" || field.schemaCustom?.includes(":grouppicker")) {
    return normalizeReference(value, "group");
  }
  if (
    ["option", "version", "component", "project", "issuetype"].includes(field.schemaType ?? "") ||
    field.schemaCustom?.includes(":select") ||
    field.schemaCustom?.includes(":version") ||
    field.schemaCustom?.includes(":radiobuttons") ||
    (field.allowedValues && field.allowedValues.length > 0 && field.schemaType !== "string")
  ) {
    return normalizeReference(value);
  }

  return value;
}

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
  let isSubtask = false;
  let isEpic = false;
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
    } else {
      issueTypeId = matchedType.id; // normalize to ID
      isSubtask = matchedType.subtask;
      isEpic = matchedType.name.toLowerCase() === "epic";
    }
  }

  // 2b. Parent validation
  let parent: CanonicalCreateItem["parent"] = null;
  if (merged.parent) {
    const pRef = merged.parent;
    if (pRef.type === "batch") {
      const ref = pRef.clientRef.trim();
      if (!ref) {
        errors.push({
          field: "parent",
          code: "PARENT_REQUIRED",
          message: "Sub-task phải chọn parent trong batch",
        });
      } else if (ref === rawItem.clientRef) {
        errors.push({
          field: "parent",
          code: "PARENT_CYCLE",
          message: "Không thể chọn chính task hiện tại làm parent",
        });
      } else {
        parent = { type: "batch", clientRef: ref };
      }
    } else if (pRef.type === "jira") {
      const key = pRef.jiraKey.trim().toUpperCase();
      if (!key) {
        errors.push({
          field: "parent",
          code: "PARENT_REQUIRED",
          message: "Sub-task phải chọn parent trên Jira",
        });
      } else if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
        errors.push({
          field: "parent",
          code: "PARENT_NOT_FOUND",
          message: `Jira key "${pRef.jiraKey}" không hợp lệ (định dạng: PROJECT-123)`,
        });
      } else {
        parent = { type: "jira", jiraKey: key };
      }
    }
  }

  // 2c. Enforce parent rules based on issue type
  if (isSubtask && !parent) {
    errors.push({
      field: "parent",
      code: "PARENT_REQUIRED",
      message: "Sub-task phải có parent (chọn task trong batch hoặc Jira key)",
    });
  }
  if (isEpic && parent) {
    errors.push({
      field: "parent",
      code: "PARENT_NOT_ALLOWED",
      message: "Epic không thể gắn parent hoặc Epic khác",
    });
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
    if (meta.priorityOptions.length === 0) {
      // No allowed values from metadata; Jira will use its default.
      priorityId = pTrim;
    } else {
      const matchedPriority = meta.priorityOptions.find(
        (p) => p.id === pTrim || p.name.toLowerCase() === pTrim.toLowerCase()
      );
      if (matchedPriority) {
        priorityId = matchedPriority.id;
      } else {
        errors.push({
          field: "priorityId",
          code: "FIELD_VALUE_NOT_ALLOWED",
          message: `Mức ưu tiên "${pTrim}" không nằm trong danh sách được phép của Jira`,
        });
      }
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
    if (!isValidIsoDate(dTrim)) {
      errors.push({
        field: "dueDate",
        code: "INVALID_DUEDATE",
        message: "Hạn hoàn thành phải có định dạng YYYY-MM-DD và ngày phải tồn tại trên lịch",
      });
    } else {
      dueDate = dTrim;
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

  // 10b. Components validation
  const componentIds: string[] = [];
  if (Array.isArray(merged.componentIds)) {
    for (const c of merged.componentIds) {
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

  // 11. Check required fields for this issue type from metadata
  const customFields: Record<string, unknown> = {};
  if (issueTypeId && meta.fieldsByIssueType[issueTypeId]) {
    const requiredFields = meta.fieldsByIssueType[issueTypeId].filter((f) => f.required);
    for (const reqField of requiredFields) {
      // Skip system fields handled above
      if (reqField.id === "summary") continue;
      if (reqField.id === "issuetype") continue;
      if (reqField.id === "project") continue;

      // Jira assigns the authenticated user as reporter when it is omitted.
      if (reqField.id === "reporter") continue;

      // Parent is validated above with the issue type sub-task rules.
      if (reqField.id === "parent") continue;

      if (reqField.id === "components") {
        if (componentIds.length === 0) {
          errors.push({
            field: "componentIds",
            code: "REQUIRED_FIELD_MISSING",
            message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
          });
        }
        continue;
      }

      if (reqField.id === "labels") {
        if (labels.length === 0) {
          errors.push({
            field: "labels",
            code: "REQUIRED_FIELD_MISSING",
            message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
          });
        }
        continue;
      }

      if (reqField.id === "description" && !description) {
        errors.push({
          field: "description",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }
      if (reqField.id === "duedate" && !dueDate) {
        errors.push({
          field: "dueDate",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }
      if (reqField.id === "priority" && !priorityId && meta.priorityOptions.length > 0) {
        errors.push({
          field: "priorityId",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }

      if (reqField.id === "assignee") {
        if (!assignee) {
          errors.push({
            field: "assignee",
            code: "REQUIRED_FIELD_MISSING",
            message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
          });
        }
        continue;
      }
      if (reqField.id === "fixVersions") {
        if (fixVersionIds.length === 0) {
          errors.push({
            field: "fixVersionIds",
            code: "REQUIRED_FIELD_MISSING",
            message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
          });
        }
        continue;
      }
      if (reqField.id === "timetracking") {
        if (!originalEstimate) {
          errors.push({
            field: "originalEstimate",
            code: "REQUIRED_FIELD_MISSING",
            message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
          });
        }
        continue;
      }
      if (reqField.id === meta.pointsFieldId) {
        if (points === undefined || points === null) {
          errors.push({
            field: "points",
            code: "REQUIRED_FIELD_MISSING",
            message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
          });
        }
        continue;
      }

      // Custom / unknown required fields
      const customValue = merged.customFields?.[reqField.id];
      if (customValue !== undefined && customValue !== null && customValue !== "") {
        customFields[reqField.id] = normalizeJiraCustomFieldValue(reqField, customValue);
        // Validate allowedValues for option fields
        if (!isAllowedCustomFieldValue(reqField, customValue)) {
          errors.push({
            field: reqField.id,
            code: "FIELD_VALUE_NOT_ALLOWED",
            message: `Giá trị cho "${reqField.name}" không nằm trong danh sách được phép`,
          });
        }
      } else {
        errors.push({
          field: reqField.id,
          code: "REQUIRED_CUSTOM_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" (${reqField.id}) chưa có dữ liệu`,
        });
      }
    }

    // Also validate non-required custom fields that have values
    if (merged.customFields) {
      for (const [fieldId, val] of Object.entries(merged.customFields)) {
        if (val === undefined || val === null || val === "") continue;
        if (fieldId in customFields) continue; // already validated above
        const fieldDef = meta.fieldsByIssueType[issueTypeId]?.find((f) => f.id === fieldId);
        customFields[fieldId] = normalizeJiraCustomFieldValue(fieldDef, val);
        if (fieldDef && !isAllowedCustomFieldValue(fieldDef, val)) {
          errors.push({
            field: fieldId,
            code: "FIELD_VALUE_NOT_ALLOWED",
            message: `Giá trị cho "${fieldDef.name}" không nằm trong danh sách được phép`,
          });
        }
      }
    }
  }

  const classification: "ready" | "blocked" = errors.length === 0 ? "ready" : "blocked";

  const normalizedFields: Partial<CanonicalCreateItem> = {
    clientRef: rawItem.clientRef,
    summary,
    issueTypeId,
    isSubtask,
    parent,
    description,
    assignee,
    priorityId,
    labels,
    points,
    originalEstimate,
    originalEstimateSeconds,
    dueDate,
    fixVersionIds,
    componentIds,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
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

/**
 * Validate batch-level parent relationships:
 * - Batch parent refs point to existing non-subtask items
 * - No dependency cycles
 * Returns additional errors to merge into preview items.
 */
export function validateBatchParentGraph(
  items: Array<{ clientRef: string; parent?: { type: "batch" | "jira"; clientRef?: string } | null; isSubtask: boolean }>
): Map<string, BulkCreateValidationError[]> {
  const errorsByRef = new Map<string, BulkCreateValidationError[]>();
  const byRef = new Map(items.map((i) => [i.clientRef, i]));

  // 1. Validate batch parent references
  for (const item of items) {
    if (item.parent?.type !== "batch") continue;
    const parentRef = item.parent.clientRef;
    if (!parentRef) continue;

    const parentItem = byRef.get(parentRef);
    if (!parentItem) {
      pushError(errorsByRef, item.clientRef, {
        field: "parent",
        code: "PARENT_NOT_FOUND",
        message: `Parent "${parentRef}" không tồn tại trong batch`,
      });
    } else if (parentItem.isSubtask) {
      pushError(errorsByRef, item.clientRef, {
        field: "parent",
        code: "PARENT_IS_SUBTASK",
        message: `Không thể chọn sub-task "${parentRef}" làm parent`,
      });
    }
  }

  // 2. Cycle detection using DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const item of items) color.set(item.clientRef, WHITE);

  const visit = (ref: string, path: string[]): void => {
    color.set(ref, GRAY);
    const item = byRef.get(ref);
    if (!item) return;
    if (item.parent?.type === "batch" && item.parent.clientRef) {
      const parentRef = item.parent.clientRef;
      const parentColor = color.get(parentRef);
      if (parentColor === GRAY) {
        const cycleStart = path.indexOf(parentRef);
        const cycle = [...path.slice(cycleStart), ref];
        for (const nodeRef of cycle) {
          pushError(errorsByRef, nodeRef, {
            field: "parent",
            code: "PARENT_CYCLE",
            message: `Phát hiện vòng lặp parent: ${cycle.join(" → ")}`,
          });
        }
      } else if (parentColor === WHITE) {
        visit(parentRef, [...path, ref]);
      }
    }
    color.set(ref, BLACK);
  };

  for (const item of items) {
    if (color.get(item.clientRef) === WHITE) {
      visit(item.clientRef, []);
    }
  }

  return errorsByRef;
}

function pushError(
  map: Map<string, BulkCreateValidationError[]>,
  ref: string,
  err: BulkCreateValidationError
): void {
  const existing = map.get(ref);
  if (existing) {
    existing.push(err);
  } else {
    map.set(ref, [err]);
  }
}
