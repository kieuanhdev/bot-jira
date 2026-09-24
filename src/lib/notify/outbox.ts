import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { NotifyType } from "./index";

/**
 * Reliable notification delivery via web-first model and outbox for Web Push.
 *
 * `deliverNotification` is the single entry point for creating a user
 * notification. It:
 *
 *  1. Checks if the user exists.
 *  2. Checks NotificationPreference for web delivery (disabledTypes).
 *  3. Creates or finds the in-app Notification row (the source of truth for the UI)
 *     deduped atomically by (userId, type, eventKey).
 *  4. Enqueues a push delivery into NotificationOutbox ONLY if:
 *     - user opted into push (pref.pushEnabled = true)
 *     - type is not in pref.pushDisabledTypes
 *     - user has a valid push subscription.
 *  5. Chat delivery is decoupled and not part of the active notification pipeline.
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
    severity?: string;
    /** Stable id of the logical event this notification refers to. */
    eventKey?: string;
    eventId?: string;
    /** When set, the push is scheduled for this time instead of immediately. */
    scheduledAt?: Date;
  }
): Promise<DeliverResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pushSubscription: true },
  });
  if (!user) return { delivered: false, skippedReason: "no_user" };

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  // Check in-app delivery preference
  if (pref && pref.disabledTypes.includes(data.type)) {
    return { delivered: false, skippedReason: "disabled" };
  }

  const rawEventKey = data.eventKey ?? data.eventId;
  const eventKey = rawEventKey && rawEventKey.trim() !== ""
    ? rawEventKey.trim()
    : `legacy:${userId}:${data.type}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;

  // In-app Notification is the single source of truth. Dedupe by (userId, type, eventKey).
  let notification = await prisma.notification.findUnique({
    where: {
      userId_type_eventKey: {
        userId,
        type: data.type,
        eventKey,
      },
    },
  });

  let isNew = false;
  if (!notification) {
    try {
      notification = await prisma.notification.create({
        data: {
          userId,
          type: data.type,
          eventKey,
          severity: data.severity ?? "info",
          title: data.title,
          body: data.body ?? "",
          link: data.link ?? null,
        },
      });
      isNew = true;
    } catch (e) {
      if (e instanceof Error && e.message.includes("P2002")) {
        // Concurrent insert for same (userId, type, eventKey)
        notification = await prisma.notification.findUnique({
          where: {
            userId_type_eventKey: {
              userId,
              type: data.type,
              eventKey,
            },
          },
        });
      } else {
        throw e;
      }
    }
  }

  if (!notification) {
    return { delivered: false, skippedReason: "already_queued" };
  }

  // Push delivery is opt-in: only enqueue if user explicitly enabled push,
  // the type is not disabled for push, and user has a pushSubscription.
  const pushOptedIn = Boolean(
    pref?.pushEnabled &&
    !pref?.pushDisabledTypes?.includes(data.type) &&
    user.pushSubscription
  );

  if (!pushOptedIn || !isNew) {
    return {
      delivered: true,
      notificationId: notification.id,
      skippedReason: isNew ? undefined : "already_queued",
    };
  }

  const key = dedupeKeyFor({ userId, type: data.type, eventId: eventKey });
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
    return { delivered: true, notificationId: notification.id, outboxId: outbox.id };
  } catch (e) {
    if (e instanceof Error && e.message.includes("P2002")) {
      return { delivered: true, notificationId: notification.id, skippedReason: "already_queued" };
    }
    throw e;
  }
}

/** Compute the next backoff delay for a failed outbox row. */
export function backoffMs(attemptCount: number): number {
  return env.notifyBackoffBaseMs * 2 ** Math.min(attemptCount, 10);
}
