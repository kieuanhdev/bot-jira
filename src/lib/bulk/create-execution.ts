import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { jiraWith } from "@/lib/jira/client";
import { audit } from "@/lib/audit";
import { userJiraAuth } from "@/lib/user-creds";
import { type BulkCreateProjectMetadata } from "./create-types";
import {
  recordExecutionMetrics,
  SLOW_ITEM_THRESHOLD_MS,
} from "./create-metrics";
import { fetchBulkCreateMetadata } from "./create-metadata";
import {
  unlockChildren,
  blockChildren,
  blockOrphanWaitingItems,
} from "./create-parent-resolver";
import { processCreateItem } from "./create-item-executor";

export const MAX_ROUNDS = 10;

/**
 * Notify user of bulk create operation result.
 */
export async function notifyCreateResult(
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

/**
 * Worker execution for bulk create operation.
 *
 * Coordinates:
 *   - Atomic operation claim
 *   - User Jira authentication
 *   - Concurrency-bounded multi-round processing loop
 *   - Unlocking children of succeeded parents and blocking children of failed parents
 *   - Terminal state aggregation, metrics, notification, and audit
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
        const success = await processCreateItem({
          operationId,
          itemId: item.id,
          rowIndex: item.rowIndex,
          projectKey,
          auth,
          jira,
          pointsFieldId,
          epicLinkFieldId,
          meta,
        });
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
  await blockOrphanWaitingItems(operationId);

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
