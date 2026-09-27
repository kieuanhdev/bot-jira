import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

/** Notify the assignee, watchers, and (for manual runs) the requester. */
export async function notifyAiEstimateReady(args: {
  jiraKey: string;
  summary: string;
  assigneeJira: string | null;
  points: number;
  confidence: number;
  scoredAt: Date;
  requesterId?: string;
}): Promise<number> {
  const [watchers, assignee] = await Promise.all([
    prisma.watch.findMany({ where: { jiraKey: args.jiraKey }, select: { userId: true } }),
    args.assigneeJira
      ? prisma.user.findFirst({ where: { jiraUsername: args.assigneeJira }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  const userIds = new Set(watchers.map((watcher) => watcher.userId));
  if (assignee) userIds.add(assignee.id);
  if (args.requesterId) userIds.add(args.requesterId);

  let notified = 0;
  await Promise.all([...userIds].map(async (userId) => {
    const result = await notifyUser(userId, {
      type: "ai",
      title: `AI đã ước lượng ${args.jiraKey}: ${args.points} điểm`,
      body: `“${args.summary}” — độ tin cậy ${Math.round(args.confidence * 100)}%.`,
      link: `/issue/${args.jiraKey}`,
      severity: "info",
      eventKey: `ai-score:${args.jiraKey}:${args.scoredAt.toISOString()}`,
    }).catch(() => null);
    if (result) notified++;
  }));
  return notified;
}
