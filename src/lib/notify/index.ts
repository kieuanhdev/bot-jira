import { prisma } from "@/lib/prisma";
import { sendPush } from "./push";

export type NotifyType =
  | "comment"
  | "release"
  | "transition"
  | "stale"
  | "ai"
  | "system";

export async function notifyUser(
  userId: string,
  data: {
    type: NotifyType;
    title: string;
    body?: string;
    link?: string;
  }
) {
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
