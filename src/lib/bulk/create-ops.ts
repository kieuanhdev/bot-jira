import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  jiraWith,
  JiraRequestError,
  type JiraAuth,
} from "@/lib/jira/client";
import { audit } from "@/lib/audit";
import {
  type BulkCreatePreviewResult,
  type BulkCreatePreviewItem,
} from "./create-types";
import {
  validateBulkCreateBatch,
  validateAndNormalizeItem,
  validateBatchParentGraph,
} from "./create-validator";
import { buildDependencyGraph } from "./dependency-graph";
import { recordPreviewMetrics } from "./create-metrics";
import {
  fetchBulkCreateMetadata,
  clearBulkCreateMetadataCache,
  invalidateBulkCreateMetadataCache,
} from "./create-metadata";
import {
  executeBulkCreateOperation,
  notifyCreateResult,
} from "./create-execution";
import {
  unlockChildren,
  blockChildren,
  blockOrphanWaitingItems,
  resolveItemParentKey,
} from "./create-parent-resolver";
import {
  processCreateItem,
  buildJiraCreateFields,
  executeCreateWithReconciliation,
} from "./create-item-executor";

export {
  fetchBulkCreateMetadata,
  clearBulkCreateMetadataCache,
  invalidateBulkCreateMetadataCache,
  executeBulkCreateOperation,
  notifyCreateResult,
  unlockChildren,
  blockChildren,
  blockOrphanWaitingItems,
  resolveItemParentKey,
  processCreateItem,
  buildJiraCreateFields,
  executeCreateWithReconciliation,
};

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
