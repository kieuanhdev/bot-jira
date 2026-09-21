import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { notifyUser, usersByJiraUsernames } from "@/lib/notify";
import type { WorkerLog } from "../guard";

const DONE_STATUSES = ["Done", "Closed", "Resolved", "Cancelled", "Done/In Review"];

export async function runStaleDetect(): Promise<WorkerLog> {
  const cutoff = new Date(Date.now() - env.staleDays * 24 * 60 * 60 * 1000);
  const openIssues = await prisma.issueCache.findMany({
    where: {
      updatedAt: { not: null, lt: cutoff },
      status: { notIn: DONE_STATUSES },
    },
  });

  let detected = 0;
  const notified: string[] = [];

  for (const issue of openIssues) {
    const ageDays = Math.floor(
      (Date.now() - (issue.updatedAt?.getTime() ?? Date.now())) / (24 * 60 * 60 * 1000)
    );
    // Only create a snapshot if there isn't a recent one for this issue.
    const recent = await prisma.staleSnapshot.findFirst({
      where: {
        jiraKey: issue.jiraKey,
        detectedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent) continue;

    await prisma.staleSnapshot.create({
      data: {
        jiraKey: issue.jiraKey,
        assignee: issue.assigneeJira,
        ageDays,
      },
    });
    detected++;

    if (issue.assigneeJira) {
      const users = await usersByJiraUsernames([issue.assigneeJira]);
      for (const u of users) {
        try {
          await notifyUser(u.id, {
            type: "stale",
            title: `Task ${issue.jiraKey} is stale (${ageDays}d)`,
            body: `"${issue.summary}" has been idle for ${ageDays} days.`,
            link: `/issue/${issue.jiraKey}`,
          });
          notified.push(issue.jiraKey);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return {
    ok: true,
    stats: { detected, notified: notified.length } as unknown as Record<string, number>,
  };
}
