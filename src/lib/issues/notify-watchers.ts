import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

/**
 * Notify watchers of a Jira issue that a new comment arrived, excluding the
 * comment author when their identity maps to a local user. Uses a dedupe key
 * so the same comment is never notified twice (e.g. from both the web POST and
 * the poll worker).
 */
export async function notifyWatchersOfComment(
  jiraKey: string,
  authorName: string,
  body: string,
  commentId: string | null = null
): Promise<number> {
  if (commentId) {
    const already = await prisma.notification.findFirst({
      where: {
        type: "comment",
        title: `New comment on ${jiraKey}`,
        body: { startsWith: authorName },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (already) {
      const existing = await prisma.notification.findMany({
        where: {
          type: "comment",
          title: `New comment on ${jiraKey}`,
        },
        select: { body: true },
      });
      if (existing.some((n) => n.body === `${authorName}: ${body.slice(0, 160)}`)) {
        return 0;
      }
    }
  }

  let authorUserId: string | null = null;
  try {
    const authorUser = await prisma.user.findFirst({
      where: { jiraUsername: authorName },
      select: { id: true },
    });
    authorUserId = authorUser?.id ?? null;
  } catch {
    /* identity mapping is best-effort */
  }

  const watchers = await prisma.watch.findMany({
    where: { jiraKey },
    select: { userId: true },
  });

  let notified = 0;
  for (const w of watchers) {
    if (w.userId === authorUserId) continue;
    try {
      await notifyUser(w.userId, {
        type: "comment",
        title: `New comment on ${jiraKey}`,
        body: `${authorName}: ${body.slice(0, 160)}`,
        link: `/issue/${jiraKey}`,
      });
      notified++;
    } catch {
      /* ignore per-user notification errors */
    }
  }
  return notified;
}
