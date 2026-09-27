import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

export type WatchedIssueSnapshot = {
  jiraKey: string;
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersionNames: string[];
  priority: string;
  points: number | null;
  type: string;
  dueDate: Date | null;
  timeSpent: number | null;
  updatedAt: Date | null;
};

const WATCHED_FIELDS: Array<{
  key: keyof Omit<WatchedIssueSnapshot, "jiraKey" | "updatedAt">;
  label: string;
}> = [
  { key: "status", label: "trạng thái" },
  { key: "summary", label: "tiêu đề" },
  { key: "description", label: "mô tả" },
  { key: "assigneeJira", label: "người phụ trách" },
  { key: "priority", label: "độ ưu tiên" },
  { key: "points", label: "story point" },
  { key: "labels", label: "nhãn" },
  { key: "fixVersionNames", label: "phiên bản phát hành" },
  { key: "type", label: "loại task" },
  { key: "dueDate", label: "hạn hoàn thành" },
  { key: "timeSpent", label: "thời gian đã ghi nhận" },
];

function comparable(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return JSON.stringify(value ?? null);
}

/** Return user-facing names for fields whose cached Jira value changed. */
export function watchedIssueChangedFields(
  previous: WatchedIssueSnapshot,
  current: WatchedIssueSnapshot
): string[] {
  return WATCHED_FIELDS.flatMap(({ key, label }) =>
    comparable(previous[key]) === comparable(current[key]) ? [] : [label]
  );
}

/**
 * Notify every watcher when Jira metadata changes, not only when a comment is
 * added. The Jira updated timestamp is shared by webhook and polling paths and
 * therefore provides a stable cross-path dedupe key.
 */
export async function notifyWatchersOfIssueChange(
  previous: WatchedIssueSnapshot | null,
  current: WatchedIssueSnapshot,
  options: { authorName?: string | null; excludeUserId?: string | null } = {}
): Promise<number> {
  if (!previous) return 0; // Initial cache population is a baseline, not an event.

  const changedFields = watchedIssueChangedFields(previous, current);
  if (changedFields.length === 0) return 0;

  let authorUserId = options.excludeUserId ?? null;
  if (!authorUserId && options.authorName) {
    const author = await prisma.user.findFirst({
      where: { jiraUsername: options.authorName },
      select: { id: true },
    }).catch(() => null);
    authorUserId = author?.id ?? null;
  }

  const watchers = await prisma.watch.findMany({
    where: { jiraKey: current.jiraKey },
    select: { userId: true },
  });
  const statusChanged = previous.status !== current.status;
  const timestamp = current.updatedAt?.toISOString() ?? "unknown-time";
  const eventKey = `jira-update:${current.jiraKey}:${timestamp}`;
  const details = statusChanged
    ? `Trạng thái: ${previous.status || "—"} → ${current.status || "—"}. Thay đổi: ${changedFields.join(", ")}.`
    : `Đã thay đổi: ${changedFields.join(", ")}.`;

  let notified = 0;
  await Promise.all(
    watchers.map(async (watcher) => {
      if (watcher.userId === authorUserId) return;
      try {
        const result = await notifyUser(watcher.userId, {
          type: statusChanged ? "transition" : "issue",
          title: statusChanged
            ? `Trạng thái ${current.jiraKey} đã thay đổi`
            : `Task ${current.jiraKey} vừa được cập nhật`,
          body: details,
          link: `/issue/${current.jiraKey}`,
          severity: "info",
          eventKey,
        });
        if (result) notified++;
      } catch {
        /* one user's preference/delivery failure must not block other watchers */
      }
    })
  );
  return notified;
}

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
