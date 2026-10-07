import { prisma } from "@/lib/prisma";
import { jira, jiraIssueFields, hasJiraCredentials } from "@/lib/jira/client";
import { upsertJiraIssue, upsertJiraCommentsWithNew } from "@/lib/issues/cache";
import { notifyWatchersOfComment, notifyWatchersOfIssueChange } from "@/lib/issues/notify-watchers";
import type { WorkerLog } from "../guard";

/** Direct reads keep watches fresh even without an inbound webhook. */
export async function runPollWatchedIssues(): Promise<WorkerLog> {
  if (!(await hasJiraCredentials())) return { ok: true, skipped: true, reason: "Jira not configured" };
  const watches = await prisma.watch.findMany({ select: { jiraKey: true }, distinct: ["jiraKey"] });
  const errors: string[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, watches.length) }, async () => {
    while (next < watches.length) {
      const { jiraKey } = watches[next++];
      try {
        const previous = await prisma.issueCache.findUnique({ where: { jiraKey } });
        const { applied, data: current } = await upsertJiraIssue(await jira.getIssue(jiraKey, jiraIssueFields()));
        if (applied) {
          await notifyWatchersOfIssueChange(previous, { jiraKey, ...current });
        }
        const { newComments } = await upsertJiraCommentsWithNew(jiraKey, await jira.getComments(jiraKey));
        for (const comment of newComments) {
          await notifyWatchersOfComment(jiraKey, comment.author, comment.body, comment.id);
        }
      } catch (error) {
        errors.push(`${jiraKey}: ${(error instanceof Error ? error.message : String(error)).slice(0, 300)}`);
      }
    }
  }));
  return { ok: errors.length === 0, stats: { checked: watches.length }, errors };
}
