import { prisma } from "@/lib/prisma";
import { deliverNotification } from "./outbox";
import { ALWAYS_NOTIFY_JIRA_USERNAMES, DEFAULT_BROADCAST_ROLES } from "./policy";

export * from "./delivery-contract";
export * from "./delivery-adapters";
export { deliverNotification, dedupeKeyFor, backoffMs, type DeliverResult } from "./outbox";

export type NotifyType =
  | "comment"
  | "issue"
  | "release"
  | "transition"
  | "stale"
  | "ai"
  | "sentry"
  | "ci"
  | "system";

export type NotifySeverity = "info" | "warning" | "danger" | "success";

export type NotifyInput = {
  type: NotifyType;
  title: string;
  body?: string;
  link?: string;
  severity?: NotifySeverity;
  /** Stable identifier of the logical event for web & push deduplication. */
  eventKey?: string;
  /** Backward-compatible alias for eventKey */
  eventId?: string;
  /** Batch Discord deliveries sharing this group; eventKey must be `${group}:<id>`. */
  chatDigestGroup?: string;
};

/**
 * Single unified entry point for creating notifications.
 *
 * Every caller goes through here. In-app notification is the source of truth,
 * deduplicated atomically by (userId, type, eventKey). Web push delivery is
 * enqueued only when the user has opted in via their notification preferences.
 */
export async function notifyUser(userId: string, data: NotifyInput) {
  const result = await deliverNotification(userId, {
    type: data.type,
    title: data.title,
    body: data.body,
    link: data.link,
    severity: data.severity,
    eventKey: data.eventKey ?? data.eventId,
    eventId: data.eventId ?? data.eventKey,
    chatDigestGroup: data.chatDigestGroup,
  });

  if (result.notificationId) {
    return prisma.notification.findUnique({ where: { id: result.notificationId } });
  }
  return null;
}

/** Find users (by jira username) to notify for a Jira-authored event. */
export async function usersByJiraUsernames(names: string[]) {
  if (names.length === 0) return [];
  return prisma.user.findMany({
    where: { jiraUsername: { in: names } },
    select: { id: true },
  });
}

/**
 * Notify all users (used for system and release-level alerts).
 * Fans out to notifyUser with the same eventKey.
 */
export async function notifyAll(data: NotifyInput) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: DEFAULT_BROADCAST_ROLES } },
        { preferences: { is: { broadcastEnabled: true } } },
        { jiraUsername: { in: [...ALWAYS_NOTIFY_JIRA_USERNAMES], mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return Promise.all(
    users.map((u) => notifyUser(u.id, data).catch(() => null))
  );
}

/**
 * Notify every account about a rare team-wide event. Each user's disabledTypes
 * preference is still honored by notifyUser.
 */
export async function notifyEveryone(data: NotifyInput) {
  const users = await prisma.user.findMany({ select: { id: true } });
  return Promise.all(
    users.map((u) => notifyUser(u.id, data).catch(() => null))
  );
}
