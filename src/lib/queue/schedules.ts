import type { PgBoss, ScheduleOptions } from "pg-boss";
import { APP_TIMEZONE } from "@/lib/date";
import type { JobName } from "./job-names";

export type ScheduleDefinition = {
  name: JobName;
  cron: string;
  options: ScheduleOptions;
};

export function pollCron(pollIntervalMs: number): string {
  const minutes = Math.max(1, Math.min(59, Math.round(pollIntervalMs / 60_000)));
  return minutes === 1 ? "* * * * *" : `*/${minutes} * * * *`;
}

export function buildScheduleDefinitions(pollIntervalMs: number): ScheduleDefinition[] {
  return [
    { name: "poll-jira-dispatch", cron: pollCron(pollIntervalMs), options: { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 2, retryDelay: 5 } },
    { name: "check-branches", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 } },
    { name: "sync-dev-status", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 300, retryLimit: 1, retryDelay: 30 } },
    { name: "parse-comment-branches", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 120, retryLimit: 2, retryDelay: 30 } },
    // This scan covers 80+ repositories and usually takes 10–15 minutes.
    { name: "poll-pr-comments", cron: "*/15 * * * *", options: { singletonSeconds: 840, expireInSeconds: 900, retryLimit: 1, retryDelay: 30 } },
    { name: "ai-score", cron: "*/10 * * * *", options: { singletonSeconds: 540, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 } },
    { name: "sentry-import", cron: "*/5 * * * *", options: { singletonSeconds: 240, expireInSeconds: 120, retryLimit: 3, retryDelay: 30, retryBackoff: true } },
    { name: "stale-detect", cron: "*/30 * * * *", options: { singletonSeconds: 1740, expireInSeconds: 300, retryLimit: 2, retryDelay: 30 } },
    { name: "deliver-notifications", cron: "* * * * *", options: { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 3, retryDelay: 15, retryBackoff: true } },
    { name: "health-alert", cron: "* * * * *", options: { singletonSeconds: 55, expireInSeconds: 60, retryLimit: 2, retryDelay: 10 } },
    // Daily jobs run on Vietnam time so the "Hằng ngày HH:MM" labels hold.
    { name: "capture-project-report-snapshots", cron: "15 0 * * *", options: { tz: APP_TIMEZONE, singletonSeconds: 3600, expireInSeconds: 1800, retryLimit: 2, retryDelay: 60 } },
    { name: "detect-people-fields", cron: "30 1 * * *", options: { tz: APP_TIMEZONE, singletonSeconds: 3600, expireInSeconds: 1800, retryLimit: 2, retryDelay: 60 } },
    { name: "reconcile-deleted-issues", cron: "*/20 * * * *", options: { singletonSeconds: 1140, expireInSeconds: 900, retryLimit: 1, retryDelay: 60 } },
    // 17:20 Vietnam time: remind assignees of Done tasks whose PR is still unmerged.
    { name: "notify-unmerged-prs", cron: "20 17 * * *", options: { tz: APP_TIMEZONE, singletonSeconds: 3600, expireInSeconds: 300, retryLimit: 2, retryDelay: 60 } },
  ];
}

export function formatCronSchedule(cron: string): string {
  const trimmed = cron.trim();
  if (trimmed === "* * * * *") {
    return "Mỗi phút";
  }
  const stepMatch = trimmed.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (stepMatch) {
    return `${stepMatch[1]} phút/lần`;
  }
  const dailyMatch = trimmed.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (dailyMatch) {
    const min = dailyMatch[1].padStart(2, "0");
    const hour = dailyMatch[2].padStart(2, "0");
    return `Hằng ngày ${hour}:${min}`;
  }
  return trimmed;
}

export function getJobSchedules(pollIntervalMs: number): Record<string, { cron: string; label: string }> {
  const map: Record<string, { cron: string; label: string }> = {};
  for (const def of buildScheduleDefinitions(pollIntervalMs)) {
    map[def.name] = {
      cron: def.cron,
      label: formatCronSchedule(def.cron),
    };
  }
  // Jobs without recurring cron schedules
  const eventJobs = [
    "poll-watched-issues",
    "poll-jira-project",
    "process-webhook",
    "bulk-op",
    "refresh-board-membership",
  ];
  for (const j of eventJobs) {
    map[j] = { cron: "", label: "Theo sự kiện" };
  }
  return map;
}

export async function registerSchedules(
  boss: Pick<PgBoss, "schedule" | "unschedule">,
  pollIntervalMs: number
): Promise<void> {
  // Remove the legacy all-project schedule before installing the dispatcher schedule.
  await boss.unschedule("poll-jira").catch(() => null);
  for (const schedule of buildScheduleDefinitions(pollIntervalMs)) {
    await boss.schedule(schedule.name, schedule.cron, null, schedule.options);
  }
}
