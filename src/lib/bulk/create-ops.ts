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
  JiraCreateMetaResponse,
  JiraCreateMetaField,
} from "@/lib/jira/types";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { audit } from "@/lib/audit";
import { userJiraAuth } from "@/lib/user-creds";
import {
  type BulkCreatePreviewResult,
  type BulkCreatePreviewItem,
  type BulkCreateProjectMetadata,
  type CanonicalCreateItem,
} from "./create-types";
import {
  validateBulkCreateBatch,
  validateAndNormalizeItem,
  validateBatchParentGraph,
  generateBulkCreateMarker,
  normalizeJiraCustomFieldValue,
} from "./create-validator";
import { buildDependencyGraph } from "./dependency-graph";
import {
  recordPreviewMetrics,
  recordExecutionMetrics,
  SLOW_ITEM_THRESHOLD_MS,
} from "./create-metrics";

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
  let epicLinkFieldId: string | null = null;
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
        schemaItems: fDef.schema?.items,
        schemaCustom: fDef.schema?.custom,
        schemaSystem: fDef.schema?.system,
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

      // Detect Epic Link field
      if (
        !epicLinkFieldId &&
        (lowerName === "epic link" ||
          lowerName === "epic" ||
          (fDef.schema as { custom?: string })?.custom === "com.pyxis.greenhopper.jira:gh-epic-link")
      ) {
        epicLinkFieldId = fId;
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

  // Time Tracking is often enabled but absent from the Create screen, so createmeta
  // alone under-reports it. Fall back to the instance-wide setting.
  if (!supportsTimeTracking) {
    try {
      const cfg = await jira.getConfiguration();
      if (cfg?.timeTrackingEnabled) supportsTimeTracking = true;
    } catch {
      // Non-fatal; keep createmeta-based detection
    }
  }

  // Fetch components from project components API
  let components: Array<{ id: string; name: string; description?: string }> = [];
  try {
    const rawComps = await jira.getProjectComponents(projectKey);
    components = (rawComps || []).map((c) => ({
      id: String(c.id),
      name: c.name,
      description: c.description,
    }));
  } catch {
    // Non-fatal if project has no components or API error
  }

  // Do NOT fallback to assumed priority IDs. If Jira metadata doesn't provide
  // allowed values, the field is unavailable and Jira's default will apply.
  const priorityOptions = Array.from(priorityOptionsMap.values());
  const versionOptions = Array.from(versionOptionsMap.values());

  const hasSubtaskTypes = issueTypes.some((t) => t.subtask);
  const defaultIssueTypeId: string | null =
    (proj as { defaultIssueTypeId?: string }).defaultIssueTypeId ?? issueTypes[0]?.id ?? null;
  const defaultSubtaskTypeId: string | null =
    issueTypes.find((t) => t.subtask)?.id ?? null;
  const allowsUnassigned = true;

  const fetchedAt = new Date().toISOString();
  const fingerprintRaw = JSON.stringify({
    projectKey,
    issueTypes: issueTypes.map((t) => ({ id: t.id, name: t.name, subtask: t.subtask })),
    pointsFieldId,
    epicLinkFieldId,
    priorities: priorityOptions.map((p) => p.id),
    versions: versionOptions.map((v) => v.id),
    components: components.map((c) => c.id),
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
    components,
    pointsFieldId,
    epicLinkFieldId,
    supportsTimeTracking,
    supportsDueDate,
    hasSubtaskTypes,
    defaultIssueTypeId,
    defaultSubtaskTypeId,
    allowsUnassigned,
    fieldCapabilities: {
      priority: {
        available: priorityOptions.length > 0,
        reason: priorityOptions.length === 0 ? "Jira metadata không trả allowed values cho priority" : undefined,
      },
      fixVersions: {
        available: versionOptions.length > 0,
        reason: versionOptions.length === 0 ? "Dự án chưa có Fix Version" : undefined,
      },
      points: {
        available: pointsFieldId !== null,
        reason: pointsFieldId === null ? "Không tìm thấy trường Story Points" : undefined,
      },
      components: {
        available: components.length > 0,
        reason: components.length === 0 ? "Dự án chưa có Hợp phần (Components)" : undefined,
      },
    },
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
  const previewStartTime = Date.now();
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

  // 2.5. Batch-level parent graph validation (cycles, missing refs, subtask-as-parent)
  const graphInput = previewItems.map((pi) => ({
    clientRef: pi.clientRef,
    parent: pi.normalizedFields.parent ?? null,
    isSubtask: pi.normalizedFields.isSubtask ?? false,
  }));
  const graphErrors = validateBatchParentGraph(graphInput);
  for (const [ref, errs] of graphErrors) {
    const target = previewItems.find((pi) => pi.clientRef === ref);
    if (target) {
      target.errors.push(...errs);
      target.classification = "blocked";
    }
  }

  // 2.55. Cascade block subtasks whose batch parent is blocked
  let newlyBlocked = true;
  while (newlyBlocked) {
    newlyBlocked = false;
    for (const item of previewItems) {
      if (item.classification === "blocked") continue;
      const parentRef =
        item.normalizedFields.parent?.type === "batch"
          ? item.normalizedFields.parent.clientRef
          : null;
      if (parentRef) {
        const parentItem = previewItems.find((pi) => pi.clientRef === parentRef);
        if (parentItem && parentItem.classification === "blocked") {
          item.classification = "blocked";
          item.errors.push({
            field: "parent",
            code: "PARENT_BLOCKED",
            message: `Task cha "${parentRef}" trong batch đang bị lỗi, không thể tạo subtask này`,
          });
          newlyBlocked = true;
        }
      }
    }
  }

  // 2.6. Build dependency graph for execution ordering
  const depGraph = buildDependencyGraph(
    previewItems.map((pi) => ({
      clientRef: pi.clientRef,
      parentClientRef: pi.normalizedFields.parent?.type === "batch" ? pi.normalizedFields.parent.clientRef ?? null : null,
    }))
  );

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
        version: 2,
        kind: "create-issues",
        projectKey: req.projectKey,
        metadataFingerprint: meta.fingerprint,
        pointsFieldId: meta.pointsFieldId,
        epicLinkFieldId: meta.epicLinkFieldId,
        defaults: (req.defaults ?? {}) as Prisma.InputJsonValue,
        source: req.source ?? { type: "grid", fileName: null },
        hasDependencies: depGraph.children.size > 0,
      },
    },
  });

  // Save BulkCreateItem records with dependency info
  await prisma.bulkCreateItem.createMany({
    data: previewItems.map((item) => {
      const parent = item.normalizedFields.parent ?? null;
      const parentClientRef = parent?.type === "batch" ? parent.clientRef ?? null : null;
      const parentJiraKey = parent?.type === "jira" ? parent.jiraKey ?? null : null;
      const depth = depGraph.depth.get(item.clientRef) ?? 0;

      return {
        operationId: operation.id,
        rowIndex: item.rowIndex,
        clientRef: item.clientRef,
        idempotencyKey: `${operation.id}:${item.rowIndex}`,
        requested: (item.normalizedFields ?? {}) as Prisma.InputJsonValue,
        status: item.classification, // "ready" | "blocked"
        errorCode: item.errors[0]?.code ?? null,
        error: item.errors.map((e) => e.message).join("; ") || null,
        retryable: true,
        parentClientRef,
        parentJiraKey,
        depth,
      };
    }),
  });

  const durationMs = Date.now() - previewStartTime;
  const blockedByErrorCode: Record<string, number> = {};
  let invalidAssigneeCount = 0;
  let batchParentCount = 0;
  let jiraParentCount = 0;
  let warningCount = 0;

  for (const item of previewItems) {
    if (item.warnings.length > 0) warningCount += item.warnings.length;
    if (item.normalizedFields.parent?.type === "batch") batchParentCount++;
    if (item.normalizedFields.parent?.type === "jira") jiraParentCount++;

    for (const err of item.errors) {
      blockedByErrorCode[err.code] = (blockedByErrorCode[err.code] ?? 0) + 1;
      if (err.field === "assignee" || err.code === "ASSIGNEE_NOT_ASSIGNABLE") {
        invalidAssigneeCount++;
      }
    }
  }

  const { isSlow } = recordPreviewMetrics({
    operationId: operation.id,
    projectKey: req.projectKey,
    durationMs,
    total: previewItems.length,
    actionable: readyItems.length,
    blocked: blockedItems.length,
    warningCount,
    blockedByErrorCode,
    invalidAssigneeCount,
    batchParentCount,
    jiraParentCount,
  });

  return {
    operationId: operation.id,
    type: "create-issues",
    total: previewItems.length,
    actionable: readyItems.length,
    blocked: blockedItems.length,
    metadataFingerprint: meta.fingerprint,
    items: previewItems,
    metrics: {
      durationMs,
      isSlow,
      blockedByErrorCode,
    },
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

  // Atomically transition ready items:
  // - Items with batch parent → "waiting_for_parent" (will be unlocked after parent succeeds)
  // - Items with no parent or Jira parent → "pending" (can execute immediately)
  const waitingUpdate = await prisma.bulkCreateItem.updateMany({
    where: { operationId, status: "ready", parentClientRef: { not: null } },
    data: { status: "waiting_for_parent" },
  });

  const readyUpdate = await prisma.bulkCreateItem.updateMany({
    where: { operationId, status: "ready", parentClientRef: null },
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
      actionable: readyUpdate.count + waitingUpdate.count,
      blocked: blockedCount,
    },
  });

  return {
    operationId,
    total: op.total,
    actionable: readyUpdate.count + waitingUpdate.count,
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
    // Fail all pending and waiting items
    await prisma.bulkCreateItem.updateMany({
      where: { operationId, status: { in: ["pending", "waiting_for_parent"] } },
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
  const payload = op.payload as {
    projectKey: string;
    metadataFingerprint?: string;
    pointsFieldId?: string | null;
    epicLinkFieldId?: string | null;
    hasDependencies?: boolean;
  };
  const projectKey = payload.projectKey;
  const pointsFieldId = payload.pointsFieldId ?? env.jiraPointsFieldId ?? null;
  const epicLinkFieldId = payload.epicLinkFieldId ?? null;

  // Prefetch metadata for worker normalization
  let meta: BulkCreateProjectMetadata | null = null;
  try {
    meta = await fetchBulkCreateMetadata(jira, projectKey, auth);
  } catch {
    // Graceful fallback if metadata prefetch fails
  }

  // Concurrency cap: default 2, max 4
  const envConcurrency = Number(process.env.BULK_CREATE_CONCURRENCY) || 2;
  const concurrency = Math.max(1, Math.min(4, envConcurrency));

  // Dependency-aware execution loop:
  // Process all "pending" items, then unlock children of succeeded parents,
  // block children of failed parents, repeat until no more work.
  const execStartTime = Date.now();
  let totalRounds = 0;
  let slowItemCount = 0;
  const itemLatenciesMs: number[] = [];

  const MAX_ROUNDS = 10; // safety cap (supports 1-level depth, but allows retries)
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const pendingItems = await prisma.bulkCreateItem.findMany({
      where: { operationId, status: "pending" },
      orderBy: { rowIndex: "asc" },
    });

    if (pendingItems.length === 0) break;
    totalRounds++;

    // Bounded worker pool for this round
    const queue = [...pendingItems];
    const results: Array<{ id: string; clientRef: string; success: boolean }> = [];
    const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const itemStart = Date.now();
        const success = await processCreateItem(
          operationId,
          item.id,
          item.rowIndex,
          projectKey,
          auth,
          jira,
          pointsFieldId,
          epicLinkFieldId,
          meta
        );
        const itemLatency = Date.now() - itemStart;
        itemLatenciesMs.push(itemLatency);
        if (itemLatency > SLOW_ITEM_THRESHOLD_MS) {
          slowItemCount++;
        }
        results.push({ id: item.id, clientRef: item.clientRef, success });
      }
    });
    await Promise.all(runners);

    // Unlock children of succeeded parents; block children of failed parents
    for (const result of results) {
      if (result.success) {
        // Get the jiraKey of the succeeded parent
        const parentItem = await prisma.bulkCreateItem.findUnique({
          where: { id: result.id },
          select: { jiraKey: true, clientRef: true },
        });
        if (parentItem?.jiraKey) {
          await unlockChildren(operationId, result.clientRef, parentItem.jiraKey);
        }
      } else {
        // Block children of failed parent
        await blockChildren(operationId, result.clientRef);
      }
    }
  }

  // Also block any remaining waiting_for_parent items (orphans whose parent was blocked/failed in a prior round)
  await prisma.bulkCreateItem.updateMany({
    where: { operationId, status: "waiting_for_parent" },
    data: {
      status: "blocked_by_parent",
      error: "Parent trong batch không được tạo thành công",
      errorCode: "PARENT_BLOCKED",
    },
  });

  // Aggregate counters from DB
  const counts = await prisma.bulkCreateItem.groupBy({
    by: ["status"],
    where: { operationId },
    _count: { _all: true },
  });

  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const succeeded = byStatus.succeeded ?? 0;
  const failed = byStatus.failed ?? 0;
  const blockedByParent = byStatus.blocked_by_parent ?? 0;
  const stillActive = (byStatus.pending ?? 0) + (byStatus.running ?? 0) + (byStatus.waiting_for_parent ?? 0);
  const terminal = stillActive === 0;

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

  const durationMs = Date.now() - execStartTime;
  recordExecutionMetrics({
    operationId,
    projectKey,
    durationMs,
    rounds: totalRounds,
    total: op.total,
    succeeded,
    failed,
    blockedByParent,
    itemLatenciesMs,
    slowItemCount,
  });

  if (terminal) {
    await notifyCreateResult(op, finalState, succeeded, failed + blockedByParent);
    await audit({
      actorId: op.requestedBy,
      action: `bulk.create.${finalState}`,
      target: operationId,
      after: { projectKey, succeeded, failed, blockedByParent },
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
  jira: ReturnType<typeof jiraWith>,
  pointsFieldId?: string | null,
  epicLinkFieldId?: string | null,
  meta?: BulkCreateProjectMetadata | null
): Promise<boolean> {
  const current = await prisma.bulkCreateItem.findUnique({ where: { id: itemId } });
  if (!current || current.status === "succeeded") return true;

  // Claim item (pending → running, or already running from a previous claim)
  const claim = await prisma.bulkCreateItem.updateMany({
    where: { id: itemId, status: "pending" },
    data: { status: "running", lastAttemptAt: new Date() },
  });
  if (claim.count === 0 && current.status !== "running") return false;

  const marker = generateBulkCreateMarker(operationId, rowIndex);
  const reqData = current.requested as Partial<CanonicalCreateItem>;

  // Resolve parent Jira key for subtasks
  let resolvedParentKey: string | null = null;
  if (current.parentJiraKey) {
    // Parent is a Jira issue that already exists
    resolvedParentKey = current.parentJiraKey;
  } else if (current.parentClientRef) {
    // Parent is another item in this batch — look up its jiraKey
    const parentItem = await prisma.bulkCreateItem.findFirst({
      where: { operationId, clientRef: current.parentClientRef },
      select: { jiraKey: true, status: true },
    });
    if (parentItem?.jiraKey) {
      resolvedParentKey = parentItem.jiraKey;
    } else {
      // Parent not yet created — should not be in "pending" state if this is true
      // but handle gracefully
      await prisma.bulkCreateItem.update({
        where: { id: itemId },
        data: {
          status: "blocked_by_parent",
          error: `Parent "${current.parentClientRef}" chưa được tạo`,
          errorCode: "PARENT_BLOCKED",
        },
      });
      return false;
    }
  }

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
        let effectiveMeta = meta;
        if (!effectiveMeta) {
          try {
            effectiveMeta = await fetchBulkCreateMetadata(jira, projectKey, auth);
          } catch {
            // ignore
          }
        }
        const issueTypeFields =
          (reqData.issueTypeId && effectiveMeta?.fieldsByIssueType[reqData.issueTypeId]) ||
          Object.values(effectiveMeta?.fieldsByIssueType ?? {}).flat();

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

      // 3. Create issue on Jira (with parent if subtask, or epic/parent if standard task)
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

      // If the project's Create screen lacks Time Tracking (and we couldn't tell up front),
      // Jira rejects the whole issue; skip the estimate and create the task without it.
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
    // Best-effort cleanup of technical idempotency marker from Jira issue labels
    if (typeof jira.removeIssueLabel === "function") {
      try {
        await jira.removeIssueLabel(finalJiraKey, marker);
      } catch {
        // Ignore marker cleanup failure so item success is not compromised
      }
    }

    await prisma.bulkCreateItem.update({
      where: { id: itemId },
      data: {
        status: "succeeded",
        jiraKey: finalJiraKey,
        jiraIssueId: finalJiraIssueId,
        resolvedParentJiraKey: resolvedParentKey,
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
      after: { operationId, clientRef: current.clientRef, parentKey: resolvedParentKey },
    });
    return true;
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
    return false;
  }
}

/**
 * Unlock children of a succeeded parent: change "waiting_for_parent" → "pending".
 */
async function unlockChildren(
  operationId: string,
  parentClientRef: string,
  parentJiraKey: string
): Promise<void> {
  await prisma.bulkCreateItem.updateMany({
    where: {
      operationId,
      parentClientRef,
      status: "waiting_for_parent",
    },
    data: {
      status: "pending",
      resolvedParentJiraKey: parentJiraKey,
      error: null,
      errorCode: null,
    },
  });
}

/**
 * Block children of a failed parent: change "waiting_for_parent" → "blocked_by_parent".
 */
async function blockChildren(
  operationId: string,
  parentClientRef: string
): Promise<void> {
  await prisma.bulkCreateItem.updateMany({
    where: {
      operationId,
      parentClientRef,
      status: "waiting_for_parent",
    },
    data: {
      status: "blocked_by_parent",
      error: `Parent "${parentClientRef}" thất bại khi tạo trên Jira`,
      errorCode: "PARENT_BLOCKED",
    },
  });
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
