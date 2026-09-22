import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { deliverToChat } from "./chat-delivery";
import type { NotifyType } from "./index";

/**
 * M5-04 — Reliable notification delivery via an outbox.
 *
 * `deliverNotification` is the single entry point for creating a user
 * notification. It:
 *
 *  1. Looks up the user's NotificationPreference and drops the notification
 *     entirely when the type is disabled.
 *  2. Creates the in-app Notification row (the source of truth for the UI).
 *  3. Enqueues a push delivery into NotificationOutbox with a dedupe key so
 *     the same logical event can never produce two pushes.
 *
 * The outbox worker (`deliver-notifications`) claims pending rows, sends the
 * push, and retries with exponential backoff until `notifyMaxAttempts`.
 */

/**
 * Build a stable dedupe key for a notification. The key is scoped to
 * (user, logical-event) so the same external event arriving twice — or the
 * same event being reprocessed after a worker crash — produces exactly one
 * delivery per user.
 */
export function dedupeKeyFor(args: {
  userId: string;
  type: NotifyType;
  /** Stable identifier of the logical event, e.g. a Jira comment id. */
  eventId: string;
}): string {
  return `${args.userId}:${args.type}:${args.eventId}`;
}

export type DeliverResult = {
  delivered: boolean;
  /** Reason when the notification was not queued. */
  skippedReason?: "disabled" | "no_user" | "already_queued";
  notificationId?: string;
  outboxId?: string;
};

export async function deliverNotification(
  userId: string,
  data: {
    type: NotifyType;
    title: string;
    body?: string;
    link?: string;
    /** Stable id of the logical event this notification refers to. */
    eventId: string;
    /** When set, the push is scheduled for this time instead of immediately. */
    scheduledAt?: Date;
  }
): Promise<DeliverResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { delivered: false, skippedReason: "no_user" };

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  if (pref && pref.disabledTypes.includes(data.type)) {
    return { delivered: false, skippedReason: "disabled" };
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: data.type,
      title: data.title,
      body: data.body ?? "",
      link: data.link ?? null,
    },
  });

  const key = dedupeKeyFor({ userId, type: data.type, eventId: data.eventId });
  try {
    const outbox = await prisma.notificationOutbox.create({
      data: {
        notificationId: notification.id,
        userId,
        channel: "push",
        title: data.title,
        body: data.body ?? "",
        link: data.link ?? null,
        dedupeKey: key,
        state: "pending",
        scheduledAt: data.scheduledAt ?? null,
      },
    });
    // M6-02 — also deliver to the team chat channel, deduped per logical event.
    // Best-effort: a chat failure must not fail the in-app/push delivery.
    void deliverToChat({
      userId,
      type: data.type,
      title: data.title,
      body: data.body ?? "",
      link: data.link ?? null,
      eventId: data.eventId,
    }).catch(() => null);
    return { delivered: true, notificationId: notification.id, outboxId: outbox.id };
  } catch (e) {
    if (e instanceof Error && e.message.includes("P2002")) {
      // Same (dedupeKey, channel) already queued — the logical event was
      // already delivered. The in-app row is still the source of truth.
      return { delivered: false, skippedReason: "already_queued", notificationId: notification.id };
    }
    throw e;
  }
}

/** Compute the next backoff delay for a failed outbox row. */
export function backoffMs(attemptCount: number): number {
  return env.notifyBackoffBaseMs * 2 ** Math.min(attemptCount, 10);
}
