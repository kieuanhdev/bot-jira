import { prisma } from "@/lib/prisma";
import { sendPush } from "./push";
import { deliverNotification } from "./outbox";

export type NotifyType =
  | "comment"
  | "release"
  | "transition"
  | "stale"
  | "ai"
  | "sentry"
  | "ci"
  | "system";

/**
 * Create an in-app notification and enqueue push delivery through the outbox.
 *
 * When `eventId` is provided the push is deduplicated by (user, type,
 * eventId) so the same logical event can never be pushed twice. When it is
 * omitted (legacy callers) the notification is created and pushed
 * best-effort as before, with no dedupe key.
 */
export async function notifyUser(
  userId: string,
  data: {
    type: NotifyType;
    title: string;
    body?: string;
    link?: string;
    /** Stable id of the logical event, used to dedupe push delivery. */
    eventId?: string;
  }
) {
  if (data.eventId) {
    const result = await deliverNotification(userId, {
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link,
      eventId: data.eventId,
    });
    if (result.notificationId) {
      const n = await prisma.notification.findUnique({ where: { id: result.notificationId } });
      if (n) return n;
    }
    return null;
  }
  const n = await prisma.notification.create({
    data: {
      userId,
      type: data.type,
      title: data.title,
      body: data.body ?? "",
      link: data.link ?? null,
    },
  });
  // Push delivery is best-effort; in-app row is the source of truth.
  try {
    await sendPush(userId, { title: data.title, body: data.body ?? "", url: data.link ?? "/" });
  } catch {
    /* ignore push errors */
  }
  return n;
}

/** Find users (by jira username) to notify for a Jira-authored event. */
export async function usersByJiraUsernames(names: string[]) {
  if (names.length === 0) return [];
  return prisma.user.findMany({
    where: { jiraUsername: { in: names } },
    select: { id: true },
  });
}

/** Notify all users (used for release-level alerts). */
export async function notifyAll(data: {
  type: NotifyType;
  title: string;
  body?: string;
  link?: string;
}) {
  const users = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(
    users.map((u) => notifyUser(u.id, data).catch(() => null))
  );
}
