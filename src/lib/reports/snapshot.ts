import { normalizeStatusToGroup } from "./status";
import { calculateCoverage, type ReportIssueInput } from "./metrics";
import { businessDaysBetween } from "@/lib/stale/business-days";
import { slaForStatus, slaExceeded, isBlockedStatus } from "@/lib/stale/sla";

export interface SnapshotProjectResult {
  projectKey: string;
  projectSnapshot: boolean;
  versionSnapshots: number;
  error?: string;
}

export interface CaptureSnapshotsResult {
  snapshotDate: string;
  timezone: string;
  projectsProcessed: number;
  totalSnapshots: number;
  results: SnapshotProjectResult[];
}

export interface CaptureSnapshotsOptions {
  projectKey?: string;
  targetDate?: Date;
  timezone?: string;
}

/**
 * Normalize date to midnight 00:00:00.000 UTC representing the start of day in the specified timezone.
 */
export function getMidnightDate(date: Date = new Date(), timezone = "Asia/Ho_Chi_Minh"): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = formatter.format(date); // Format: "YYYY-MM-DD"
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export type SnapshotIssue = ReportIssueInput & {
  fixVersionIds: string[];
  fixVersionNames: string[];
};

/**
 * Pure calculation of aggregated snapshot stats from a list of issue records.
 */
export function calculateSnapshotMetrics(
  issues: ReportIssueInput[],
  now: Date = new Date()
) {
  const statusGroupCounts: Record<string, { count: number; points: number; estimateSeconds: number }> = {};

  let totalPoints: number | null = null;
  let donePoints: number | null = null;
  let totalEstimateSeconds: number | null = null;
  let doneEstimateSeconds: number | null = null;
  let doneCount = 0;
  let blockedCount = 0;
  let overdueCount = 0;
  let overSlaCount = 0;
  let unassignedCount = 0;

  for (const issue of issues) {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    if (!statusGroupCounts[group]) {
      statusGroupCounts[group] = { count: 0, points: 0, estimateSeconds: 0 };
    }
    statusGroupCounts[group].count += 1;

    const isDone = group === "Done";
    if (isDone) doneCount += 1;

    if (issue.points !== null && !isNaN(issue.points)) {
      totalPoints = (totalPoints ?? 0) + issue.points;
      statusGroupCounts[group].points += issue.points;
      if (isDone) {
        donePoints = (donePoints ?? 0) + issue.points;
      }
    }

    if (issue.originalEstimateSeconds !== null && !isNaN(issue.originalEstimateSeconds)) {
      totalEstimateSeconds = (totalEstimateSeconds ?? 0) + issue.originalEstimateSeconds;
      statusGroupCounts[group].estimateSeconds += issue.originalEstimateSeconds;
      if (isDone) {
        doneEstimateSeconds = (doneEstimateSeconds ?? 0) + issue.originalEstimateSeconds;
      }
    }

    if (group === "Blocked" || isBlockedStatus(issue.status)) {
      blockedCount += 1;
    }

    if (!isDone) {
      if (issue.dueDate && issue.dueDate < now) {
        overdueCount += 1;
      }
      const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
      const ageDays = businessDaysBetween(stateDate, now);
      const sla = slaForStatus(issue.status, issue.statusCategory);
      const { exceeded } = slaExceeded(ageDays, sla);
      if (exceeded) {
        overSlaCount += 1;
      }
      if (!issue.assigneeJira || issue.assigneeJira.trim() === "") {
        unassignedCount += 1;
      }
    }
  }

  const coverage = calculateCoverage(issues);

  return {
    unit: coverage.recommendedUnit,
    statusGroups: statusGroupCounts,
    totalCount: issues.length,
    doneCount,
    totalPoints,
    donePoints,
    totalEstimateSeconds,
    doneEstimateSeconds,
    blockedCount,
    overdueCount,
    overSlaCount,
    unassignedCount,
  };
}
