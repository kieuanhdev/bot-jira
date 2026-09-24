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

  const eventKey = `jira-comment:${commentId ?? `${jiraKey}:${authorName}:${body.slice(0, 64)}`}`;

  let notified = 0;
  for (const w of watchers) {
    if (w.userId === authorUserId) continue;
    try {
      const res = await notifyUser(w.userId, {
        type: "comment",
        title: `Bình luận mới trên ${jiraKey}`,
        body: `${authorName}: ${body.slice(0, 160)}`,
        link: `/issue/${jiraKey}`,
        severity: "info",
        eventKey,
      });
      if (res) notified++;
    } catch {
      /* ignore per-user notification errors */
    }
  }
  return notified;
}
