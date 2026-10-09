import { prisma } from "@/lib/prisma";
import {
  jiraWith,
  JiraRequestError,
  type JiraAuth,
} from "@/lib/jira/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { audit } from "@/lib/audit";
import {
  type BulkCreateProjectMetadata,
  type CanonicalCreateItem,
} from "./create-types";
import {
  generateBulkCreateMarker,
  normalizeJiraCustomFieldValue,
} from "./create-validator";
import { fetchBulkCreateMetadata } from "./create-metadata";
import { resolveItemParentKey } from "./create-parent-resolver";

export const MAX_CREATE_ATTEMPTS = 3;

export interface ProcessCreateItemParams {
  operationId: string;
  itemId: string;
  rowIndex: number;
  projectKey: string;
  auth: JiraAuth;
  jira: ReturnType<typeof jiraWith>;
  pointsFieldId?: string | null;
  epicLinkFieldId?: string | null;
  meta?: BulkCreateProjectMetadata | null;
}

export interface BuildJiraCreateFieldsParams {
  reqData: Partial<CanonicalCreateItem>;
  meta?: BulkCreateProjectMetadata | null;
  pointsFieldId?: string | null;
  epicLinkFieldId?: string | null;
  resolvedParentKey?: string | null;
}

/**
 * Builds the extraFields payload for Jira issue creation, including
 * duedate, timetracking, fixVersions, components, story points, custom fields,
 * and parent / epic link.
 */
export function buildJiraCreateFields(
  params: BuildJiraCreateFieldsParams
): Record<string, unknown> {
  const { reqData, meta, pointsFieldId, epicLinkFieldId, resolvedParentKey } = params;
  const extraFields: Record<string, unknown> = {};

  if (reqData.dueDate) {
    extraFields.duedate = reqData.dueDate;
  }

  const typeFields = reqData.issueTypeId ? meta?.fieldsByIssueType[reqData.issueTypeId] : undefined;
  const timetrackingOnScreen = !typeFields || typeFields.some((f) => f.id === "timetracking");
  if (reqData.originalEstimate && timetrackingOnScreen) {
    extraFields.timetracking = { originalEstimate: reqData.originalEstimate };
  }

  if (reqData.fixVersionIds && reqData.fixVersionIds.length > 0) {
    extraFields.fixVersions = reqData.fixVersionIds.map((id) => ({ id }));
  }

  if (reqData.componentIds && reqData.componentIds.length > 0) {
    extraFields.components = reqData.componentIds.map((id) => ({ id }));
  }

  if (reqData.points !== undefined && reqData.points !== null && pointsFieldId) {
    extraFields[pointsFieldId] = reqData.points;
  }

  if (reqData.customFields) {
    const issueTypeFields =
      (reqData.issueTypeId && meta?.fieldsByIssueType[reqData.issueTypeId]) ||
      Object.values(meta?.fieldsByIssueType ?? {}).flat();

    for (const [fieldId, val] of Object.entries(reqData.customFields)) {
      if (val !== undefined && val !== null && val !== "") {
        const fieldDef = issueTypeFields.find((f) => f.id === fieldId);
        const normalized = normalizeJiraCustomFieldValue(fieldDef, val);
        if (normalized !== undefined && normalized !== null && normalized !== "") {
          extraFields[fieldId] = normalized;
        }
      }
    }
  }

  if (resolvedParentKey) {
    if (reqData.isSubtask) {
      extraFields.parent = { key: resolvedParentKey };
    } else {
      if (epicLinkFieldId) {
        extraFields[epicLinkFieldId] = resolvedParentKey;
      } else {
        extraFields.parent = { key: resolvedParentKey };
      }
    }
  }

  return extraFields;
}

export interface JiraCreateExecutionResult {
  success: boolean;
  finalJiraKey: string | null;
  finalJiraIssueId: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  retryable: boolean;
  attempts: number;
}

/**
 * Executes issue creation on Jira with:
 *   1. Idempotency marker reconciliation search first (prevent duplicates on restart/retry)
 *   2. Extra fields construction & normalization
 *   3. Create issue API call with timetracking rejection fallback
 *   4. Exponential backoff retry on transient errors
 */
export async function executeCreateWithReconciliation(params: {
  operationId: string;
  rowIndex: number;
  projectKey: string;
  auth: JiraAuth;
  jira: ReturnType<typeof jiraWith>;
  reqData: Partial<CanonicalCreateItem>;
  resolvedParentKey: string | null;
  pointsFieldId?: string | null;
  epicLinkFieldId?: string | null;
  meta?: BulkCreateProjectMetadata | null;
  initialAttempts: number;
}): Promise<JiraCreateExecutionResult> {
  const {
    operationId,
    rowIndex,
    projectKey,
    auth,
    jira,
    reqData,
    resolvedParentKey,
    pointsFieldId,
    epicLinkFieldId,
    initialAttempts,
  } = params;

  let effectiveMeta = params.meta;
  const marker = generateBulkCreateMarker(operationId, rowIndex);

  let attempts = initialAttempts;
  let success = false;
  let finalJiraKey: string | null = null;
  let finalJiraIssueId: string | null = null;
  let errorMessage: string | null = null;
  let errorCode: string | null = null;
  let retryable = true;

  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
    attempts++;
    try {
      // 1. Idempotency guard: Reconcile with marker search first
      const existing = await jira.findIssueByBulkMarker(projectKey, marker);
      if (existing) {
        success = true;
        finalJiraKey = existing.key;
        finalJiraIssueId = existing.id;
        break;
      }

      // If customFields exist but effectiveMeta is missing, lazy fetch
      if (reqData.customFields && !effectiveMeta) {
        try {
          effectiveMeta = await fetchBulkCreateMetadata(jira, projectKey, auth);
        } catch {
          // ignore
        }
      }

      // 2. Prepare Jira issue fields
      const extraFields = buildJiraCreateFields({
        reqData,
        meta: effectiveMeta,
        pointsFieldId,
        epicLinkFieldId,
        resolvedParentKey,
      });

      const createInput = {
        projectKey,
        issueTypeId: reqData.issueTypeId,
        summary: reqData.summary || `Task #${rowIndex + 1}`,
        description: reqData.description,
        assignee: reqData.assignee,
        priorityId: reqData.priorityId,
        labels: reqData.labels ?? [],
        idempotencyMarker: marker,
        fields: extraFields,
      };

      // If the project's Create screen lacks Time Tracking, Jira rejects the whole issue;
      // fallback: omit timetracking and create without it.
      let created: Awaited<ReturnType<typeof jira.createIssue>>;
      try {
        created = await jira.createIssue(createInput);
      } catch (createErr) {
        if (extraFields.timetracking && /timetracking/i.test((createErr as Error).message || "")) {
          const { timetracking: _omit, ...restFields } = extraFields;
          void _omit;
          created = await jira.createIssue({ ...createInput, fields: restFields });
        } else {
          throw createErr;
        }
      }

      success = true;
      finalJiraKey = created.key;
      finalJiraIssueId = created.id;
      break;
    } catch (err) {
      const jErr = err as JiraRequestError;
      errorMessage = jErr.message || String(err);
      retryable = jErr.retryable ?? false;

      // Status code categorization
      if (
        jErr.status === 400 ||
        jErr.status === 401 ||
        jErr.status === 403 ||
        jErr.status === 404 ||
        jErr.status === 409
      ) {
        retryable = false;
        errorCode = `JIRA_${jErr.status}`;
        break;
      }

      if (attempt < MAX_CREATE_ATTEMPTS && retryable) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  return {
    success,
    finalJiraKey,
    finalJiraIssueId,
    errorMessage,
    errorCode,
    retryable,
    attempts,
  };
}

/**
 * Process a single BulkCreateItem:
 *   - Atomic claim
 *   - Idempotency guard (already succeeded items never re-run)
 *   - Parent resolution
 *   - Jira creation with reconciliation
 *   - Marker label cleanup, cache refresh, and audit logging
 */
export async function processCreateItem(params: ProcessCreateItemParams): Promise<boolean> {
  const {
    operationId,
    itemId,
    rowIndex,
    projectKey,
    auth,
    jira,
    pointsFieldId,
    epicLinkFieldId,
    meta,
  } = params;

  const current = await prisma.bulkCreateItem.findUnique({ where: { id: itemId } });
  if (!current || current.status === "succeeded") return true;

  // Claim item (pending → running, or already running from a previous claim)
  const claim = await prisma.bulkCreateItem.updateMany({
    where: { id: itemId, status: "pending" },
    data: { status: "running", lastAttemptAt: new Date() },
  });
  if (claim.count === 0 && current.status !== "running") return false;

  const reqData = current.requested as Partial<CanonicalCreateItem>;

  // Resolve parent Jira key for subtasks/epics
  const parentResolution = await resolveItemParentKey(operationId, itemId, {
    parentJiraKey: current.parentJiraKey,
    parentClientRef: current.parentClientRef,
  });

  if (parentResolution.blocked) {
    return false;
  }

  const resolvedParentKey = parentResolution.resolvedParentKey;

  const executionResult = await executeCreateWithReconciliation({
    operationId,
    rowIndex,
    projectKey,
    auth,
    jira,
    reqData,
    resolvedParentKey,
    pointsFieldId,
    epicLinkFieldId,
    meta,
    initialAttempts: current.attemptCount,
  });

  const marker = generateBulkCreateMarker(operationId, rowIndex);

  if (executionResult.success && executionResult.finalJiraKey) {
    // Best-effort cleanup of technical idempotency marker from Jira issue labels
    if (typeof jira.removeIssueLabel === "function") {
      try {
        await jira.removeIssueLabel(executionResult.finalJiraKey, marker);
      } catch {
        // Ignore marker cleanup failure so item success is not compromised
      }
    }

    await prisma.bulkCreateItem.update({
      where: { id: itemId },
      data: {
        status: "succeeded",
        jiraKey: executionResult.finalJiraKey,
        jiraIssueId: executionResult.finalJiraIssueId,
        resolvedParentJiraKey: resolvedParentKey,
        attemptCount: executionResult.attempts,
        error: null,
        errorCode: null,
      },
    });

    // Best-effort cache sync
    try {
      await refreshJiraIssueCache(jira, executionResult.finalJiraKey);
    } catch {
      // Ignore cache sync failure
    }

    await audit({
      actorId: auth.user || "system",
      action: "issue.create",
      target: executionResult.finalJiraKey,
      after: { operationId, clientRef: current.clientRef, parentKey: resolvedParentKey },
    });
    return true;
  } else {
    await prisma.bulkCreateItem.update({
      where: { id: itemId },
      data: {
        status: "failed",
        error: executionResult.errorMessage || "Tạo task thất bại",
        errorCode: executionResult.errorCode || "CREATE_FAILED",
        retryable: executionResult.retryable,
        attemptCount: executionResult.attempts,
      },
    });

    await audit({
      actorId: auth.user || "system",
      action: "issue.create.failed",
      target: current.clientRef,
      after: { operationId, error: executionResult.errorMessage, retryable: executionResult.retryable },
    });
    return false;
  }
}
