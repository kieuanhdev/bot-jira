import type { PollJiraProjectJobData } from "./workers/poll-jira";

export type JobMetadata = unknown;

function timestampMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Calculate age of scheduled/startup Jira poll job.
 */
export function scheduledJiraJobAgeMs(
  data: PollJiraProjectJobData,
  job?: unknown,
  nowMs = Date.now()
): number | null {
  if (data.source !== "schedule" && data.source !== "startup") return null;

  const jobObj = typeof job === "object" && job !== null ? (job as Record<string, unknown>) : undefined;
  const queuedAt = timestampMs(data.requestedAt)
    ?? timestampMs(jobObj?.createdOn)
    ?? timestampMs(jobObj?.created_on);

  return queuedAt === null ? null : Math.max(0, nowMs - queuedAt);
}

/**
 * Anti-backlog policy:
 * Scheduled polls rely on pg-boss queue policy ('stately') and singletonKey
 * deduplication/coalescing to prevent unbounded queue growth.
 *
 * Jobs are NOT skipped merely due to requestedAt age so retrying jobs are
 * preserved and never falsely marked as successful.
 * Manual, admin, and recovery jobs are always executed.
 */
export function shouldSkipStaleJiraJob(
  data: PollJiraProjectJobData,
  ..._args: unknown[]
): boolean {
  void _args;
  // Manual, admin, and recovery requests are always executed
  if (data.source !== "schedule" && data.source !== "startup") {
    return false;
  }
  // Rely on stately queue + singletonKey deduplication.
  // Retrying jobs and scheduled reconciliation are preserved.
  return false;
}
