import type { PollJiraProjectJobData } from "./workers/poll-jira";

export const STALE_SCHEDULED_JIRA_JOB_MS = 2 * 60_000;

type JobTimestamps = {
  createdOn?: Date | string;
  created_on?: Date | string;
};

function timestampMs(value: Date | string | undefined): number | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Scheduled/startup polls are reconciliation hints, so an old one should not
 * consume Jira capacity after a newer poll is already queued. Manual/admin and
 * recovery requests are intentional and must never be discarded as backlog.
 */
export function scheduledJiraJobAgeMs(
  data: PollJiraProjectJobData,
  job: JobTimestamps,
  nowMs = Date.now()
): number | null {
  if (data.source !== "schedule" && data.source !== "startup") return null;

  // requestedAt is created by our server and is present in every current Jira
  // job. pg-boss does not expose createdOn consistently across versions, so
  // keep its metadata only as a fallback for legacy jobs.
  const queuedAt = timestampMs(data.requestedAt)
    ?? timestampMs(job.createdOn)
    ?? timestampMs(job.created_on);

  return queuedAt === null ? null : Math.max(0, nowMs - queuedAt);
}

export function shouldSkipStaleJiraJob(
  data: PollJiraProjectJobData,
  job: JobTimestamps,
  nowMs = Date.now()
): boolean {
  const ageMs = scheduledJiraJobAgeMs(data, job, nowMs);
  return ageMs !== null && ageMs > STALE_SCHEDULED_JIRA_JOB_MS;
}
