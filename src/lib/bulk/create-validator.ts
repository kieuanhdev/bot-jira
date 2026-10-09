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
} from "./create-types";
import {
  isAllowedCustomFieldValue,
  normalizeJiraCustomFieldValue,
  validateAndNormalizeCustomFields,
} from "./create-custom-fields";
import {
  mergeDefaultsWithRow,
  normalizeSummary,
  normalizeDescription,
  normalizeAssignee,
  normalizePriority,
  normalizeLabels,
  normalizePoints,
  normalizeEstimate,
  normalizeDueDate,
  normalizeFixVersions,
  normalizeComponents,
  normalizeParent,
} from "./create-normalization";

// Compatibility re-exports
export {
  isAllowedCustomFieldValue,
  normalizeJiraCustomFieldValue,
  mergeDefaultsWithRow,
};

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
  const { summary, error: summaryError } = normalizeSummary(merged.summary);
  if (summaryError) errors.push(summaryError);

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
  const { parent, errors: parentErrors } = normalizeParent(merged.parent, rawItem.clientRef);
  if (parentErrors.length > 0) {
    errors.push(...parentErrors);
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
  const { description, error: descError } = normalizeDescription(merged.description);
  if (descError) errors.push(descError);

  // 4. Assignee validation
  const assignee = normalizeAssignee(merged.assignee);

  // 5. Priority validation
  const { priorityId, error: priorityError } = normalizePriority(merged.priorityId, meta);
  if (priorityError) errors.push(priorityError);

  // 6. Labels validation
  const { labels, warnings: labelWarnings } = normalizeLabels(merged.labels);
  if (labelWarnings.length > 0) warnings.push(...labelWarnings);

  // 7. Points validation
  const { points, error: pointsError, warning: pointsWarning } = normalizePoints(merged.points, meta);
  if (pointsError) errors.push(pointsError);
  if (pointsWarning) warnings.push(pointsWarning);

  // 8. Original Estimate validation
  const {
    originalEstimate,
    originalEstimateSeconds,
    error: estError,
    warning: estWarning,
  } = normalizeEstimate(merged.originalEstimate, meta);
  if (estError) errors.push(estError);
  if (estWarning) warnings.push(estWarning);

  // 9. Due Date validation
  const { dueDate, error: dueDateError } = normalizeDueDate(merged.dueDate);
  if (dueDateError) errors.push(dueDateError);

  // 10. Fix Versions validation
  const { fixVersionIds, errors: versionErrors } = normalizeFixVersions(merged.fixVersionIds, meta);
  if (versionErrors.length > 0) errors.push(...versionErrors);

  // 10b. Components validation
  const { componentIds, errors: componentErrors } = normalizeComponents(merged.componentIds, meta);
  if (componentErrors.length > 0) errors.push(...componentErrors);

  // 11. Check required system fields for this issue type from metadata
  if (issueTypeId && meta.fieldsByIssueType[issueTypeId]) {
    const requiredFields = meta.fieldsByIssueType[issueTypeId].filter((f) => f.required);
    for (const reqField of requiredFields) {
      if (reqField.id === "summary" || reqField.id === "issuetype" || reqField.id === "project") continue;
      if (reqField.id === "reporter") continue;
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
      if (reqField.id === "assignee" && !assignee) {
        errors.push({
          field: "assignee",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }
      if (reqField.id === "fixVersions" && fixVersionIds.length === 0) {
        errors.push({
          field: "fixVersionIds",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }
      if (reqField.id === "timetracking" && !originalEstimate) {
        errors.push({
          field: "originalEstimate",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }
      if (reqField.id === meta.pointsFieldId && (points === undefined || points === null)) {
        errors.push({
          field: "points",
          code: "REQUIRED_FIELD_MISSING",
          message: `Trường bắt buộc "${reqField.name}" chưa có dữ liệu`,
        });
        continue;
      }
    }
  }

  // 12. Validate & normalize custom fields
  const { customFields, errors: customFieldErrors } = validateAndNormalizeCustomFields(
    issueTypeId,
    merged.customFields,
    meta
  );
  if (customFieldErrors.length > 0) errors.push(...customFieldErrors);

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
