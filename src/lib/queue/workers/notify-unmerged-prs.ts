import { prisma } from "@/lib/prisma";
import { confirmedBranchLinkFilter } from "@/lib/bitbucket/branch-links";
import { deliverToChat } from "@/lib/notify/chat-delivery";
import { jiraUsernameAliases } from "@/lib/user-creds";
import type { WorkerLog } from "../guard";

export const UNMERGED_PR_TIMEZONE = "Asia/Ho_Chi_Minh";
const MAX_LISTED_TASKS = 15;

export type UnmergedPrTask = {
  jiraKey: string;
  summary: string;
  prs: { id: number | null; url: string | null }[];
};

/** Calendar day in the team's timezone, used so each day's reminder is sent once. */
export function localDateKey(now: Date, timeZone = UNMERGED_PR_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function buildUnmergedPrMessage(tasks: UnmergedPrTask[]): { title: string; body: string } {
  const lines = tasks.slice(0, MAX_LISTED_TASKS).map((task) => {
    const prs = task.prs
      .map((pr) => (pr.url ? `[PR #${pr.id ?? "?"}](${pr.url})` : `PR #${pr.id ?? "?"}`))
      .join(", ");
    return `• ${task.jiraKey} — ${task.summary.slice(0, 80)}${prs ? ` (${prs})` : ""}`;
  });
  const extra = tasks.length - lines.length;
  if (extra > 0) lines.push(`… và ${extra} task khác`);
  return {
    title: `Nhắc nhở: ${tasks.length} task đã Done nhưng PR chưa được merge`,
    body: `${lines.join("\n")}\n\nVui lòng kiểm tra và merge PR (hoặc báo reviewer) trước khi hết ngày.`,
  };
}

/**
 * Daily 17:20 reminder. For every user who configured Discord, DM the tasks
 * assigned to them that are Done in Jira while a linked PR is still OPEN.
 */
export async function runNotifyUnmergedPrs(now: Date = new Date()): Promise<WorkerLog> {
  const issues = await prisma.issueCache.findMany({
    where: {
      deletedAt: null,
      statusCategory: "done",
      assigneeJira: { not: null },
      ...confirmedBranchLinkFilter({ prState: { in: ["OPEN", "open"] }, merged: false }),
    },
    select: {
      jiraKey: true,
      summary: true,
      assigneeJira: true,
      branchLinks: {
        where: {
          linkState: "confirmed",
          branch: { deletedAt: null, prState: { in: ["OPEN", "open"] }, merged: false },
        },
        select: { branch: { select: { prId: true, prUrl: true } } },
      },
    },
    orderBy: { jiraKey: "asc" },
  });

  const byAssignee = new Map<string, UnmergedPrTask[]>();
  for (const issue of issues) {
    const key = issue.assigneeJira!.toLowerCase();
    const tasks = byAssignee.get(key) ?? [];
    tasks.push({
      jiraKey: issue.jiraKey,
      summary: issue.summary,
      prs: issue.branchLinks.map((link) => ({ id: link.branch.prId, url: link.branch.prUrl })),
    });
    byAssignee.set(key, tasks);
  }

  const users = await prisma.user.findMany({
    where: { discordIntegration: { isNot: null }, jiraUsername: { not: null } },
    select: { id: true, jiraUsername: true },
  });

  const day = localDateKey(now);
  const errors: string[] = [];
  let notified = 0;
  let skipped = 0;

  for (const user of users) {
    const seen = new Set<string>();
    const tasks: UnmergedPrTask[] = [];
    for (const alias of jiraUsernameAliases(user.jiraUsername)) {
      for (const task of byAssignee.get(alias.toLowerCase()) ?? []) {
        if (!seen.has(task.jiraKey)) {
          seen.add(task.jiraKey);
          tasks.push(task);
        }
      }
    }
    if (tasks.length === 0) continue;

    tasks.sort((a, b) => a.jiraKey.localeCompare(b.jiraKey));
    const message = buildUnmergedPrMessage(tasks);
    try {
      const result = await deliverToChat({
        userId: user.id,
        type: "issue",
        title: message.title,
        body: message.body,
        link: "/branches?view=needs-attention",
        eventId: `unmerged-pr-reminder:${day}`,
      });
      if (result.delivered) notified++;
      else skipped++;
    } catch (error) {
      errors.push(`${user.id}: ${String(error)}`);
    }
  }

  return {
    ok: errors.length === 0,
    stats: { candidateTasks: issues.length, discordUsers: users.length, notified, skipped },
    ...(errors.length > 0 ? { errors } : {}),
  };
}
