import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/notify/push";
import { backoffMs } from "@/lib/notify/outbox";
import { sendChatOutbox } from "@/lib/notify/chat-delivery";
import {
  getDeliveryAdapter,
  computeOutboxTransition,
} from "@/lib/notify";
import { env } from "../guard";
import type { WorkerLog } from "../guard";

const BATCH_SIZE = 100;

/**
 * M5-04 — Notification outbox delivery.
 *
 * Claims pending/scheduled outbox rows, attempts delivery via standardized channel
 * adapters (push, discord), and updates delivery state via pure transition logic.
 * Failed rows are retried with exponential backoff until `NOTIFY_MAX_ATTEMPTS`,
 * after which they are marked `failed`.
 */
export async function runDeliverNotifications(): Promise<WorkerLog> {
  const now = new Date();
  const due = await prisma.notificationOutbox.findMany({
    where: {
      state: { in: ["pending"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true, userId: true, channel: true, title: true, body: true, link: true, attemptCount: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let nextRetry: Date | undefined;

  for (const row of due) {
    // A short lease prevents concurrent workers sending the same row. If a
    // worker exits during delivery, the normal sweep recovers the expired lease.
    const claimed = await prisma.notificationOutbox.updateMany({
      where: {
        id: row.id,
        state: "pending",
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
      },
      data: { scheduledAt: new Date(Date.now() + 120_000) },
    });
    if (claimed.count === 0) continue;

    try {
      const adapter = getDeliveryAdapter(row.channel, {
        push: { prisma, sendPush },
        discord: { sendChatOutbox },
      });

      const outcome = await adapter.deliver(row);
      const transition = computeOutboxTransition({
        item: row,
        outcome,
        maxAttempts: env.notifyMaxAttempts,
        now,
        computeBackoffMs: (attempts) => backoffMs(attempts),
      });

      if (transition.cleanupPushSubscription) {
        await prisma.user.update({
          where: { id: row.userId },
          data: { pushSubscription: null as unknown as object },
        }).catch(() => null);
      }

      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          state: transition.state,
          deliveredAt: transition.deliveredAt,
          lastError: transition.lastError,
          ...(transition.attemptCount !== undefined ? { attemptCount: transition.attemptCount } : {}),
          ...(transition.state === "pending" || transition.state === "failed"
            ? { scheduledAt: transition.scheduledAt }
            : {}),
        },
      });

      if (transition.isTerminalSuccess) {
        sent++;
      } else if (transition.isTerminalSkipped) {
        skipped++;
      } else if (transition.isExhaustedFailure) {
        failed++;
        if (transition.lastError) {
          errors.push(`${row.id}: ${transition.lastError}`);
        }
      } else if (transition.isRescheduled) {
        if (transition.scheduledAt && (!nextRetry || transition.scheduledAt < nextRetry)) {
          nextRetry = transition.scheduledAt;
        }
        if (transition.lastError) {
          errors.push(`${row.id}: ${transition.lastError}`);
        }
      }
    } catch (e) {
      errors.push(`${row.id}: ${(e as Error).message}`);
    }
  }

  if (due.length === BATCH_SIZE) {
    const { enqueueNotificationDelivery } = await import("../enqueue");
    await enqueueNotificationDelivery();
  }
  if (nextRetry) {
    const { enqueueNotificationDelivery } = await import("../enqueue");
    await enqueueNotificationDelivery(nextRetry);
  }

  return {
    ok: true,
    stats: { sent, failed, skipped, due: due.length },
    errors,
  };
}
