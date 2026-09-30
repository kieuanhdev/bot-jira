import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import {
  jiraWith,
  JiraRequestError,
  type JiraAuth,
} from "@/lib/jira/client";
import type {
  JiraIssue,
  JiraCreateMetaResponse,
  JiraCreateMetaField,
} from "@/lib/jira/types";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { audit } from "@/lib/audit";
import { userJiraAuth } from "@/lib/user-creds";
import {
  type BulkCreateRequest,
  type BulkCreatePreviewResult,
  type BulkCreatePreviewItem,
  type BulkCreateProjectMetadata,
  type CanonicalCreateItem,
} from "./create-types";
import {
  validateBulkCreateBatch,
  validateAndNormalizeItem,
  generateBulkCreateMarker,
} from "./create-validator";

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const metadataCache = new Map<
  string,
  { meta: BulkCreateProjectMetadata; expiresAt: number }
>();

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Fetch and adapt Jira Data Center create metadata for a given project.
 */
export async function fetchBulkCreateMetadata(
  jira: ReturnType<typeof jiraWith>,
  projectKey: string,
  userAuth: JiraAuth
): Promise<BulkCreateProjectMetadata> {
  const cacheKey = `${userAuth.token ? sha256(userAuth.token).slice(0, 8) : "anon"}:${projectKey}`;
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.meta;
  }

  // 1. Fetch create metadata
  let createmeta: JiraCreateMetaResponse;
  try {
    createmeta = await jira.getCreateMetadata(projectKey);
  } catch (err) {
    throw new JiraRequestError(
      `Không thể lấy metadata tạo task cho dự án ${projectKey}: ${(err as Error).message}`,
      (err as JiraRequestError).status ?? 500,
      (err as JiraRequestError).retryable ?? false
    );
  }

  const proj = createmeta.projects?.find(
    (p) => p.key.toUpperCase() === projectKey.toUpperCase()
  );
  if (!proj) {
    throw new JiraRequestError(
      `Dự án ${projectKey} không tồn tại hoặc bạn không có quyền truy cập`,
      404,
      false
    );
  }

  // 2. Check CREATE_ISSUES permission
  let canCreate = false;
  let permissionReason: string | undefined;
  try {
    const myPerms = await jira.getMyPermissions(projectKey);
    const createPerm = myPerms.permissions?.CREATE_ISSUES;
    canCreate = Boolean(createPerm?.havePermission);
    if (!canCreate) {
      permissionReason = "Tài khoản của bạn không có quyền tạo task (CREATE_ISSUES) trong dự án này.";
    }
  } catch {
    // If permissions check fails, fallback to canCreate = true if issuetypes are returned
    canCreate = (proj.issuetypes?.length ?? 0) > 0;
  }

  // 3. Process Issue Types & Fields
  const issueTypes = (proj.issuetypes ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    subtask: Boolean(t.subtask),
    description: t.description,
    iconUrl: t.iconUrl,
  }));

  const fieldsByIssueType: BulkCreateProjectMetadata["fieldsByIssueType"] = {};
  const priorityOptionsMap = new Map<string, { id: string; name: string }>();
  const versionOptionsMap = new Map<
    string,
    { id: string; name: string; archived?: boolean; released?: boolean }
  >();
  let pointsFieldId: string | null = env.jiraPointsFieldId || null;
  let supportsTimeTracking = false;
  let supportsDueDate = false;

  for (const it of proj.issuetypes ?? []) {
    const fieldList: BulkCreateProjectMetadata["fieldsByIssueType"][string] = [];
    const fields = it.fields ?? {};

    for (const [fId, fDef] of Object.entries(fields) as [string, JiraCreateMetaField][]) {
      fieldList.push({
        id: fId,
        name: fDef.name,
        required: Boolean(fDef.required),
        schemaType: fDef.schema?.type,
        allowedValues: fDef.allowedValues?.map((v) => ({
          id: String(v.id),
          name: v.name,
          value: v.value,
        })),
      });

      // Detect points field if not configured
      const lowerName = fDef.name.trim().toLowerCase();
      if (
        !pointsFieldId &&
        (lowerName === "story points" || lowerName === "task points") &&
        fDef.schema?.type === "number"
      ) {
        pointsFieldId = fId;
      }

      // Detect timetracking and duedate
      if (fId === "timetracking") supportsTimeTracking = true;
      if (fId === "duedate") supportsDueDate = true;

      // Collect priorities
      if (fId === "priority" && Array.isArray(fDef.allowedValues)) {
        for (const pv of fDef.allowedValues) {
          if (pv.id) {
            priorityOptionsMap.set(String(pv.id), {
              id: String(pv.id),
              name: pv.name || pv.value || String(pv.id),
            });
          }
        }
      }

      // Collect fix versions
      if (fId === "fixVersions" && Array.isArray(fDef.allowedValues)) {
        for (const fv of fDef.allowedValues) {
          if (fv.id) {
            versionOptionsMap.set(String(fv.id), {
              id: String(fv.id),
              name: fv.name || fv.value || String(fv.id),
              archived: Boolean(fv.archived),
              released: Boolean(fv.released),
            });
          }
        }
      }
    }

    fieldsByIssueType[it.id] = fieldList;
  }

  // Supplement version options from project versions API
  try {
    const versions = await jira.getVersions(projectKey);
    for (const v of versions) {
      if (v.id) {
        versionOptionsMap.set(String(v.id), {
          id: String(v.id),
          name: v.name || String(v.id),
          archived: Boolean(v.archived),
          released: Boolean(v.released),
        });
      }
    }
  } catch {
    // Non-fatal, use whatever fixVersions allowedValues had
  }

  // Fallback priorities if none extracted from metadata
  const priorityOptions =
    priorityOptionsMap.size > 0
      ? Array.from(priorityOptionsMap.values())
      : [
          { id: "1", name: "Highest" },
          { id: "2", name: "High" },
          { id: "3", name: "Medium" },
          { id: "4", name: "Low" },
          { id: "5", name: "Lowest" },
        ];

  const versionOptions = Array.from(versionOptionsMap.values());

  const fetchedAt = new Date().toISOString();
  const fingerprintRaw = JSON.stringify({
    projectKey,
    issueTypes: issueTypes.map((t) => ({ id: t.id, name: t.name })),
    pointsFieldId,
    priorities: priorityOptions.map((p) => p.id),
    versions: versionOptions.map((v) => v.id),
  });
  const fingerprint = `sha256:${sha256(fingerprintRaw)}`;

  const metaResult: BulkCreateProjectMetadata = {
    project: {
      key: proj.key,
      name: proj.name,
      id: proj.id,
    },
    canCreate,
    permissionReason,
    issueTypes,
    fieldsByIssueType,
    priorityOptions,
    versionOptions,
    pointsFieldId,
    supportsTimeTracking,
    supportsDueDate,
    fetchedAt,
    fingerprint,
  };

  metadataCache.set(cacheKey, {
    meta: metaResult,
    expiresAt: Date.now() + METADATA_CACHE_TTL_MS,
  });

  return metaResult;
}

/**
 * Preview bulk create request, validate all items against Jira metadata, and save immutable snapshot.
 */
export async function previewBulkCreate(
  userId: string,
  jira: ReturnType<typeof jiraWith>,
  userAuth: JiraAuth,
  rawRequest: unknown
): Promise<BulkCreatePreviewResult> {
  const batchValid = validateBulkCreateBatch(rawRequest);
  if (!batchValid.ok) {
    throw new Error(batchValid.errors.map((e) => e.message).join(", "));
  }

  const req = batchValid.data;
  const meta = await fetchBulkCreateMetadata(jira, req.projectKey, userAuth);
  if (!meta.canCreate) {
    throw new JiraRequestError(
      meta.permissionReason || `Bạn không có quyền tạo task trong dự án ${req.projectKey}`,
      403,
      false
    );
  }

  // 1. Validate & normalize each item
  const previewItems: BulkCreatePreviewItem[] = [];
  const seenSummaries = new Map<string, number>();

  req.items.forEach((item, idx) => {
    const previewItem = validateAndNormalizeItem(item, idx, req.defaults, meta);

    // Duplicate summary check within batch
    const normSummary = (previewItem.normalizedFields.summary || "").toLowerCase().trim();
    if (normSummary) {
      if (seenSummaries.has(normSummary)) {
        previewItem.warnings.push({
          field: "summary",
          code: "DUPLICATE_SUMMARY_BATCH",
          message: `Tiêu đề trùng với dòng số ${(seenSummaries.get(normSummary) ?? 0) + 1} trong cùng batch`,
        });
      } else {
        seenSummaries.set(normSummary, idx);
      }
    }

    previewItems.push(previewItem);
  });

  // 2. Check duplicate summary against existing open Jira issues in IssueCache
  const summariesToCheck = previewItems
    .map((i) => i.normalizedFields.summary)
    .filter((s): s is string => Boolean(s && s.length > 0));

  if (summariesToCheck.length > 0) {
    try {
      const existingIssues = await prisma.issueCache.findMany({
        where: {
          projectKey: req.projectKey,
          summary: { in: summariesToCheck },
          statusCategory: { not: "done" },
        },
        select: { jiraKey: true, summary: true },
      });

      const existingMap = new Map(existingIssues.map((i) => [i.summary.toLowerCase(), i.jiraKey]));
      for (const item of previewItems) {
        const s = (item.normalizedFields.summary || "").toLowerCase();
        const existingKey = existingMap.get(s);
        if (existingKey) {
          item.existingDuplicateKey = existingKey;
          item.warnings.push({
            field: "summary",
            code: "DUPLICATE_SUMMARY_JIRA",
            message: `Trùng tiêu đề với task đang mở trên Jira: ${existingKey}`,
          });
        }
      }
    } catch {
      // Best-effort check; don't block preview on DB failure
    }
  }

  const readyItems = previewItems.filter((i) => i.classification === "ready");
  const blockedItems = previewItems.filter((i) => i.classification === "blocked");

  // 3. Save immutable snapshot into database
  const operation = await prisma.bulkOperation.create({
    data: {
      type: "create-issues",
      requestedBy: userId,
      state: "preview",
      total: previewItems.length,
      payload: {
        version: 1,
        kind: "create-issues",
        projectKey: req.projectKey,
        metadataFingerprint: meta.fingerprint,
        defaults: req.defaults ?? {},
        source: req.source ?? { type: "grid", fileName: null },
      },
    },
  });

  // Save BulkCreateItem records
  await prisma.bulkCreateItem.createMany({
    data: previewItems.map((item) => ({
      operationId: operation.id,
      rowIndex: item.rowIndex,
      clientRef: item.clientRef,
      idempotencyKey: `${operation.id}:${item.rowIndex}`,
      requested: (item.normalizedFields ?? {}) as Prisma.InputJsonValue,
      status: item.classification, // "ready" | "blocked"
      errorCode: item.errors[0]?.code ?? null,
      error: item.errors.map((e) => e.message).join("; ") || null,
      retryable: true,
    })),
  });

  return {
    operationId: operation.id,
    type: "create-issues",
    total: previewItems.length,
    actionable: readyItems.length,
    blocked: blockedItems.length,
    metadataFingerprint: meta.fingerprint,
    items: previewItems,
  };
}

/**
 * Confirm previewed bulk create operation.
 */
export async function confirmBulkCreate(
  operationId: string,
  userId: string
): Promise<{
  operationId: string;
  total: number;
  actionable: number;
  blocked: number;
}> {
  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    select: { id: true, requestedBy: true, state: true, total: true, type: true },
  });

  if (!op || op.requestedBy !== userId) {
    throw new Error("Không tìm thấy thao tác hoặc bạn không có quyền");
  }
  if (op.type !== "create-issues") {
    throw new Error("Thao tác không phải là tạo task hàng loạt");
  }
  if (op.state !== "preview") {
    throw new Error("Thao tác này đã được xác nhận trước đó");
  }

  // Atomically transition ready items to pending
  const readyUpdate = await prisma.bulkCreateItem.updateMany({
    where: { operationId, status: "ready" },
    data: { status: "pending" },
  });

  const blockedCount = await prisma.bulkCreateItem.count({
    where: { operationId, status: "blocked" },
  });

  await prisma.bulkOperation.update({
    where: { id: operationId },
    data: {
      state: "queued",
      startedAt: new Date(),
    },
  });

  await audit({
    actorId: userId,
    action: "bulk.create.confirm",
    target: operationId,
    after: {
      total: op.total,
      actionable: readyUpdate.count,
      blocked: blockedCount,
    },
  });

  return {
    operationId,
    total: op.total,
    actionable: readyUpdate.count,
    blocked: blockedCount,
  };
}

/**
 * Worker execution for bulk create operation.
 */
export async function executeBulkCreateOperation(operationId: string): Promise<void> {
  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    include: {
      createItems: {
        orderBy: { rowIndex: "asc" },
      },
    },
  });

  if (!op) return;
  if (["completed", "partially_failed", "failed", "cancelled"].includes(op.state)) return;

  // Claim operation atomically
  const claim = await prisma.bulkOperation.updateMany({
    where: { id: operationId, state: "queued" },
    data: { state: "running", startedAt: op.startedAt ?? new Date() },
  });
  if (claim.count === 0 && op.state !== "running") return;

  // Load user credentials
  const user = await prisma.user.findUnique({
    where: { id: op.requestedBy },
    select: {
      id: true,
      email: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
    },
  });

  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    // Fail all pending items
    await prisma.bulkCreateItem.updateMany({
      where: { operationId, status: "pending" },
      data: {
        status: "failed",
        errorCode: "JIRA_CREDENTIALS_REQUIRED",
        error: "Yêu cầu cấu hình token Jira cá nhân để tạo task",
        retryable: false,
      },
    });

    await prisma.bulkOperation.update({
      where: { id: operationId },
      data: {
        state: "failed",
        failed: op.total,
        completedAt: new Date(),
      },
    });

    await notifyCreateResult(op, "failed", 0, op.total);
    return;
  }

  const jira = jiraWith(auth);
  const payload = op.payload as { projectKey: string; metadataFingerprint?: string };
  const projectKey = payload.projectKey;

  // Concurrency cap: default 2, max 4
  const envConcurrency = Number(process.env.BULK_CREATE_CONCURRENCY) || 2;
  const concurrency = Math.max(1, Math.min(4, envConcurrency));

  // Fetch pending items
  const pendingItems = await prisma.bulkCreateItem.findMany({
    where: { operationId, status: "pending" },
    orderBy: { rowIndex: "asc" },
  });

  // Bounded worker pool
  const queue = [...pendingItems];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      await processCreateItem(operationId, item.id, item.rowIndex, projectKey, auth, jira);
    }
  });

  await Promise.all(runners);

  // Aggregate counters from DB
  const counts = await prisma.bulkCreateItem.groupBy({
    by: ["status"],
    where: { operationId },
    _count: { _all: true },
  });

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const succeeded = byStatus.succeeded ?? 0;
  const failed = byStatus.failed ?? 0;
  const stillPending = (byStatus.pending ?? 0) + (byStatus.running ?? 0);
  const terminal = stillPending === 0;

  const finalState = !terminal
    ? "running"
    : failed === 0
      ? "completed"
      : succeeded > 0
        ? "partially_failed"
        : "failed";

  await prisma.bulkOperation.update({
    where: { id: operationId },
    data: {
      state: finalState,
      succeeded,
      failed,
      completedAt: terminal ? new Date() : undefined,
    },
  });

  if (terminal) {
    await notifyCreateResult(op, finalState, succeeded, failed);
    await audit({
      actorId: op.requestedBy,
      action: `bulk.create.${finalState}`,
      target: operationId,
      after: { projectKey, succeeded, failed },
    });
  }
}

const MAX_CREATE_ATTEMPTS = 3;

async function processCreateItem(
  operationId: string,
  itemId: string,
  rowIndex: number,
  projectKey: string,
  auth: JiraAuth,
  jira: ReturnType<typeof jiraWith>
): Promise<void> {
  const current = await prisma.bulkCreateItem.findUnique({ where: { id: itemId } });
  if (!current || current.status === "succeeded") return;

  // Claim item
  const claim = await prisma.bulkCreateItem.updateMany({
    where: { id: itemId, status: "pending" },
    data: { status: "running", lastAttemptAt: new Date() },
  });
  if (claim.count === 0 && current.status !== "running") return;

  const marker = generateBulkCreateMarker(operationId, rowIndex);
  const reqData = current.requested as Partial<CanonicalCreateItem>;

  let attempts = current.attemptCount;
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

      // 2. Prepare Jira issue fields
      const extraFields: Record<string, unknown> = {};

      if (reqData.dueDate) {
        extraFields.duedate = reqData.dueDate;
      }
      if (reqData.originalEstimate) {
        extraFields.timetracking = { originalEstimate: reqData.originalEstimate };
      }
      if (reqData.fixVersionIds && reqData.fixVersionIds.length > 0) {
        extraFields.fixVersions = reqData.fixVersionIds.map((id) => ({ id }));
      }
      if (reqData.points !== undefined && reqData.points !== null && env.jiraPointsFieldId) {
        extraFields[env.jiraPointsFieldId] = reqData.points;
      }

      // 3. Create issue on Jira
      const created = await jira.createIssue({
        projectKey,
        issueTypeId: reqData.issueTypeId,
        summary: reqData.summary || `Task #${rowIndex + 1}`,
        description: reqData.description,
        assignee: reqData.assignee,
        priorityId: reqData.priorityId,
        labels: reqData.labels ?? [],
        idempotencyMarker: marker,
        fields: extraFields,
      });

      success = true;
      finalJiraKey = created.key;
      finalJiraIssueId = created.id;
      break;
    } catch (err) {
      const jErr = err as JiraRequestError;
      errorMessage = jErr.message || String(err);
      retryable = jErr.retryable ?? false;

      // Status code categorization
      if (jErr.status === 400 || jErr.status === 401 || jErr.status === 403 || jErr.status === 404 || jErr.status === 409) {
        retryable = false;
        errorCode = `JIRA_${jErr.status}`;
        break;
      }

      if (attempt < MAX_CREATE_ATTEMPTS && retryable) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  if (success && finalJiraKey) {
    await prisma.bulkCreateItem.update({
      where: { id: itemId },
      data: {
        status: "succeeded",
        jiraKey: finalJiraKey,
        jiraIssueId: finalJiraIssueId,
        attemptCount: attempts,
        error: null,
        errorCode: null,
      },
    });

    // Best-effort cache sync
    try {
      await refreshJiraIssueCache(jira, finalJiraKey);
    } catch {
      // Ignore cache sync failure
    }

    await audit({
      actorId: auth.user || "system",
      action: "issue.create",
      target: finalJiraKey,
      after: { operationId, clientRef: current.clientRef },
    });
  } else {
    await prisma.bulkCreateItem.update({
      where: { id: itemId },
      data: {
        status: "failed",
        error: errorMessage || "Tạo task thất bại",
        errorCode: errorCode || "CREATE_FAILED",
        retryable,
        attemptCount: attempts,
      },
    });

    await audit({
      actorId: auth.user || "system",
      action: "issue.create.failed",
      target: current.clientRef,
      after: { operationId, error: errorMessage, retryable },
    });
  }
}

async function notifyCreateResult(
  op: { requestedBy: string; id: string },
  state: string,
  succeeded: number,
  failed: number
): Promise<void> {
  try {
    const { notifyUser } = await import("@/lib/notify");
    const statusText =
      state === "completed"
        ? "hoàn tất thành công"
        : state === "partially_failed"
          ? "thất bại một phần"
          : "thất bại";
    const severity =
      state === "completed" ? "success" : state === "partially_failed" ? "warning" : "danger";

    await notifyUser(op.requestedBy, {
      type: "system",
      title: `Tạo task hàng loạt ${statusText}`,
      body: `${succeeded} task đã tạo thành công, ${failed} task lỗi.`,
      link: `/bulk?operation=${op.id}`,
      severity,
      eventKey: `bulk-create:${op.id}:${state}`,
    });
  } catch {
    // Ignore notification errors
  }
}
