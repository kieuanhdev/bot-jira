import { prisma } from "@/lib/prisma";
import { sendPush } from "@/lib/notify/push";
import { backoffMs } from "@/lib/notify/outbox";
import { env } from "../guard";
import type { WorkerLog } from "../guard";

const BATCH_SIZE = 100;

/**
 * M5-04 — Notification outbox delivery.
 *
 * Claims pending/scheduled outbox rows, attempts the push, and updates the
 * delivery state. Failed rows are retried with exponential backoff until
 * `NOTIFY_MAX_ATTEMPTS`, after which they are marked `failed`. Rows whose
 * user no longer has a push subscription are marked `sent` with no delivery
 * (the in-app Notification row is the source of truth and stays).
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
    select: { id: true, userId: true, title: true, body: true, link: true, attemptCount: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of due) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: row.userId },
        select: { id: true, pushSubscription: true },
      });
      if (!user) {
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { state: "skipped", lastError: "user not found" },
        });
        skipped++;
        continue;
      }
      if (!user.pushSubscription) {
        // No push subscription: the in-app row was already created. Mark the
        // push as sent (delivered to the in-app channel) so we don't retry
        // forever.
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { state: "sent", deliveredAt: now, lastError: "no push subscription" },
        });
        sent++;
        continue;
      }

      try {
        await sendPush(row.userId, { title: row.title, body: row.body, url: row.link ?? "/" });
        await prisma.notificationOutbox.update({
          where: { id: row.id },
          data: { state: "sent", deliveredAt: now, lastError: null },
        });
        sent++;
      } catch (pushError) {
        const message = (pushError instanceof Error ? pushError.message : String(pushError)).slice(0, 500);
        // 404/410 from the push service means the subscription is gone —
        // clear it so the user can re-subscribe, and stop retrying.
        if (message.includes("404") || message.includes("410") || /Gone|expired|not.?found/i.test(message)) {
          await prisma.user.update({
            where: { id: row.userId },
            data: { pushSubscription: null as unknown as object },
          }).catch(() => null);
          await prisma.notificationOutbox.update({
            where: { id: row.id },
            data: { state: "skipped", lastError: "subscription gone", deliveredAt: now },
          });
          skipped++;
        } else {
          const attempts = row.attemptCount + 1;
          const exhausted = attempts >= env.notifyMaxAttempts;
          await prisma.notificationOutbox.update({
            where: { id: row.id },
            data: {
              state: exhausted ? "failed" : "pending",
              attemptCount: attempts,
              lastError: message,
              scheduledAt: exhausted ? null : new Date(Date.now() + backoffMs(attempts)),
            },
          });
          if (exhausted) failed++;
          errors.push(`${row.id}: ${message}`);
        }
      }
    } catch (e) {
      errors.push(`${row.id}: ${(e as Error).message}`);
    }
  }

  return {
    ok: true,
    stats: { sent, failed, skipped, due: due.length } as unknown as Record<string, number>,
    errors,
  };
}
