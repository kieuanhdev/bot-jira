import { mapWithConcurrency } from "@/lib/async/concurrency";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { jiraWith } from "@/lib/jira/client";
import { audit } from "@/lib/audit";
import { userJiraAuth, jiraUsernameAliases } from "@/lib/user-creds";
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
import { markSentryRowFromBulkOp } from "@/lib/sentry/bulk-completion";
import {
  OPEN_SENTRY_STATES,
  sentryImportIdOfPayload,
  sentryImportIdsOfPayload,
} from "@/lib/sentry/create-from-form";
import { logger } from "@/lib/logger";

export const MAX_ROUNDS = 10;

export const MSG_SENTRY_ALREADY_FILED = "Lỗi Sentry đã được tạo task ở luồng khác";

async function markSentryRowSafely(operationId: string): Promise<void> {
  try {
    await markSentryRowFromBulkOp(operationId);
  } catch (err) {
    // Best-effort: never fail the bulk operation because of the Sentry link
    logger.error({
      message: "Failed to mark Sentry row from bulk create op",
      operationId,
      error: (err as Error).message,
    });
  }
}

/**
 * For a Sentry-sourced op: returns the set of Sentry row ids that were already
 * filed or taken by another flow (approved for the sentry-import worker, created, ...).
 */
export async function getSentryTakenRowIds(payload: unknown): Promise<Set<string>> {
  const ids = sentryImportIdsOfPayload(payload);
  if (ids.length === 0) return new Set();
  const rows =
    (await prisma.sentryIssueImported.findMany({
      where: { id: { in: ids } },
      select: { id: true, state: true, jiraKey: true },
    })) ?? [];
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const taken = new Set<string>();
  for (const id of ids) {
    const row = rowMap.get(id);
    if (!row || Boolean(row.jiraKey) || !OPEN_SENTRY_STATES.includes(row.state)) {
      taken.add(id);
    }
  }
  return taken;
}

export function sentryIdOfItem(clientRef: string | undefined | null, payload: unknown): string | null {
  if (clientRef && clientRef.startsWith("sentry-")) {
    return clientRef.slice("sentry-".length);
  }
  return sentryImportIdOfPayload(payload);
}

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
 * Notify assignees about newly created tasks assigned to them.
 * When multiple tasks are assigned to the same user in a bulk operation,
 * they are aggregated into a single notification to avoid spamming the user.
 */
export async function notifyBulkCreateAssignees(
  op: { requestedBy: string; id: string },
  projectKey: string
): Promise<void> {
  try {
    const succeededItems = await prisma.bulkCreateItem.findMany({
      where: { operationId: op.id, status: "succeeded", jiraKey: { not: null } },
      select: { jiraKey: true, requested: true },
      orderBy: { rowIndex: "asc" },
    });

    if (succeededItems.length === 0) return;

    // Group created tasks by assignee username
    type TaskSummary = { jiraKey: string; summary: string };
    const tasksByAssignee = new Map<string, TaskSummary[]>();

    for (const item of succeededItems) {
      if (!item.jiraKey) continue;
      const req = item.requested as { summary?: string; assignee?: string | null } | null;
      const rawAssignee = req?.assignee?.trim();
      if (!rawAssignee) continue;
      const list = tasksByAssignee.get(rawAssignee) ?? [];
      list.push({
        jiraKey: item.jiraKey,
        summary: req?.summary?.trim() || item.jiraKey,
      });
      tasksByAssignee.set(rawAssignee, list);
    }

    if (tasksByAssignee.size === 0) return;

    // Lookup creator's display name or username
    const creator = await prisma.user.findUnique({
      where: { id: op.requestedBy },
      select: { displayName: true, jiraUsername: true },
    });
    const creatorName = creator?.displayName || creator?.jiraUsername || "Hệ thống";

    const { notifyUser } = await import("@/lib/notify");

    for (const [assigneeJira, tasks] of tasksByAssignee.entries()) {
      const users = await prisma.user.findMany({
        where: { jiraUsername: { in: jiraUsernameAliases(assigneeJira) } },
        select: { id: true },
      });

      for (const u of users) {
        if (u.id === op.requestedBy) continue; // Skip self-assignment in bulk create

        if (tasks.length === 1) {
          await notifyUser(u.id, {
            type: "issue",
            title: `Bạn được gán task ${tasks[0].jiraKey}`,
            body: `${creatorName} đã tạo và gán task "${tasks[0].summary}" cho bạn.`,
            link: `/issue/${tasks[0].jiraKey}`,
            severity: "info",
            eventKey: `bulk-create-assign:${op.id}:${assigneeJira}:${tasks[0].jiraKey}`,
          }).catch(() => null);
        } else {
          const keysStr = tasks.map((t) => t.jiraKey).join(", ");
          const preview = tasks
            .slice(0, 3)
            .map((t) => `${t.jiraKey} ("${t.summary}")`)
            .join("; ");
          const moreStr = tasks.length > 3 ? ` và ${tasks.length - 3} task khác.` : ".";

          await notifyUser(u.id, {
            type: "issue",
            title: `Bạn được gán ${tasks.length} task mới (${projectKey})`,
            body: `${creatorName} đã tạo và gán ${tasks.length} task cho bạn: ${keysStr}.\nCác task gồm: ${preview}${moreStr}`,
            link: `/bulk?operation=${op.id}`,
            severity: "info",
            eventKey: `bulk-create-assign:${op.id}:${assigneeJira}:batch`,
          }).catch(() => null);
        }
      }
    }
  } catch {
    // Ignore notification errors so bulk operation completion is never failed
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

  // Re-check Sentry rows at execution time: the confirm-time guard cannot
  // see rows approved/filed while this op sat in the queue (e.g. worker outage).
  const takenSentryIds = await getSentryTakenRowIds(op.payload);
  if (takenSentryIds.size > 0) {
    const pendingItems = await prisma.bulkCreateItem.findMany({
      where: { operationId, status: { in: ["pending", "waiting_for_parent"] } },
      select: { id: true, clientRef: true },
    });
    const takenItemIds = pendingItems
      .filter((item) => {
        const rowId = sentryIdOfItem(item.clientRef, op.payload);
        return rowId && takenSentryIds.has(rowId);
      })
      .map((item) => item.id);

    if (takenItemIds.length > 0) {
      await prisma.bulkCreateItem.updateMany({
        where: { id: { in: takenItemIds } },
        data: {
          status: "failed",
          errorCode: "SENTRY_ALREADY_FILED",
          error: MSG_SENTRY_ALREADY_FILED,
          retryable: false,
        },
      });

      // If all items in this op were taken elsewhere, cancel the op
      if (takenItemIds.length >= op.total) {
        await prisma.bulkOperation.update({
          where: { id: operationId },
          data: { state: "cancelled", failed: op.total, completedAt: new Date() },
        });
        logger.warn({ message: "Skipped Sentry bulk create op: all rows already filed", operationId });
        await notifyCreateResult(op, "failed", 0, op.total);
        return;
      }
    }
  }

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

    await markSentryRowSafely(operationId);
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
    const results = await mapWithConcurrency(pendingItems, concurrency, async (item) => {
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
      return { id: item.id, clientRef: item.clientRef, success };
    });

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

  // The issue cache is refreshed per created item in processCreateItem.
  if (terminal) {
    await markSentryRowSafely(operationId);
  }

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
    if (succeeded > 0) {
      await notifyBulkCreateAssignees(op, projectKey);
    }
    await audit({
      actorId: op.requestedBy,
      action: `bulk.create.${finalState}`,
      target: operationId,
      after: { projectKey, succeeded, failed, blockedByParent },
    });
  }
}
