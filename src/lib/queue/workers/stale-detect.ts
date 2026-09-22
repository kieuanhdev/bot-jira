import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { notifyUser, usersByJiraUsernames } from "@/lib/notify";
import type { WorkerLog } from "../guard";
import { computeAges } from "@/lib/stale/age";
import { classifyStale, STALE_REASON_LABELS } from "@/lib/stale/classify";
import { slaForStatus, slaExceeded } from "@/lib/stale/sla";

const DONE_STATUSES = ["Done", "Closed", "Resolved", "Cancelled", "Done/In Review"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runStaleDetect(): Promise<WorkerLog> {
  const now = new Date();
  // Use the most conservative SLA as the pre-filter cutoff so we don't miss
  // any task that might exceed its per-status threshold.
  const minSlaDays = Math.min(
    env.staleBacklogDays,
    env.staleTodoDays,
    env.staleInProgressDays,
    env.staleReviewDays,
    env.staleQaDays,
    env.staleBlockedDays,
    env.staleUnknownDays,
  );
  const preCutoff = new Date(now.getTime() - minSlaDays * MS_PER_DAY);

  const openIssues = await prisma.issueCache.findMany({
    where: {
      updatedAt: { not: null, lt: preCutoff },
      status: { notIn: DONE_STATUSES },
      statusCategory: { not: "done" },
      deletedAt: null,
    },
  });

  let detected = 0;
  let notified = 0;
  const errors: string[] = [];

  for (const issue of openIssues) {
    try {
      // M8-01: compute the four age metrics.
      const ages = computeAges(
        {
          createdAt: issue.createdAt,
          statusChangedAt: issue.statusChangedAt,
          updatedAt: issue.updatedAt,
          status: issue.status,
        },
        now,
      );

      // M8-01: resolve per-status SLA.
      const sla = slaForStatus(issue.status, issue.statusCategory);
      const { exceeded, overBy } = slaExceeded(ages.stateAgeDays, sla);

      if (!exceeded) continue;

      // M8-02: classify the stale reason.
      const reason = classifyStale({
        status: issue.status,
        statusCategory: issue.statusCategory,
        assigneeJira: issue.assigneeJira,
        labels: issue.labels,
        ages,
      });

      // Dedup: skip if a snapshot was created in the last 24 h for this issue.
      const recent = await prisma.staleSnapshot.findFirst({
        where: {
          jiraKey: issue.jiraKey,
          detectedAt: { gte: new Date(now.getTime() - MS_PER_DAY) },
        },
      });
      if (recent) continue;

      // Look up the previous snapshot (if any) to compare severity for
      // notification cadence: only notify on first breach or severity increase.
      const prev = await prisma.staleSnapshot.findFirst({
        where: { jiraKey: issue.jiraKey },
        orderBy: { detectedAt: "desc" },
      });

      const severity = sla.severity;
      const severityRank: Record<string, number> = { info: 0, warning: 1, high: 2 };
      const prevSeverityRank = prev ? (severityRank[prev.severity] ?? 0) : -1;
      const severityIncreased = (severityRank[severity] ?? 1) > prevSeverityRank;
      const isReminder = prev !== null && !severityIncreased &&
        now.getTime() - prev.detectedAt.getTime() >= env.staleReminderDays * MS_PER_DAY;
      const shouldNotify = !prev || severityIncreased || isReminder;

      await prisma.staleSnapshot.create({
        data: {
          jiraKey: issue.jiraKey,
          assignee: issue.assigneeJira,
          ageDays: ages.stateAgeDays,
          totalAgeDays: ages.totalAgeDays,
          stateAgeDays: ages.stateAgeDays,
          inactiveDays: ages.inactiveDays,
          blockedDays: ages.blockedDays,
          stateAgeLowConfidence: ages.stateAgeLowConfidence,
          staleReason: reason,
          severity,
          status: issue.status,
          statusCategory: issue.statusCategory,
          slaDays: sla.days,
        },
      });
      detected++;

      // M8-03: notification only on first breach, severity increase, or
      // reminder period elapsed. Never notify for "no_assignee" reason to
      // the assignee (there is none); notify watchers instead.
      if (shouldNotify && issue.assigneeJira && reason !== "no_assignee") {
        const users = await usersByJiraUsernames([issue.assigneeJira]);
        const reasonLabel = STALE_REASON_LABELS[reason];
        const eventId = `stale:${issue.jiraKey}:${severity}:${overBy}`;
        for (const u of users) {
          try {
            await notifyUser(u.id, {
              type: "stale",
              title: `Task ${issue.jiraKey} exceeds SLA (+${overBy}d)`,
              body: `"${issue.summary}" — ${reasonLabel}, ${ages.stateAgeDays}d in "${issue.status}" (SLA ${sla.days}d).`,
              link: `/issue/${issue.jiraKey}`,
              eventId,
            });
            notified++;
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      errors.push(`${issue.jiraKey}: ${(err as Error).message}`);
    }
  }

  return {
    ok: true,
    stats: { detected, notified, scanned: openIssues.length, errors: errors.length },
    errors: errors.length > 0 ? errors : undefined,
  };
}
