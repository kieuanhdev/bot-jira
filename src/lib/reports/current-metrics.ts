import type {
  ProjectSnapshotMetrics,
  EffectiveUnit,
  CoverageMetric,
} from "./types";
import { type ReportIssueInput } from "./metrics";
import { normalizeStatusToGroup, isDoneGroup, isWipGroup } from "./status";
import { isBlockedStatus, slaForStatus, slaExceeded } from "@/lib/stale/sla";
import { businessDaysBetween } from "@/lib/stale/business-days";
import { resolveCompletionDate } from "./completion-date";

export interface CalculateSnapshotMetricsInput {
  issues: ReportIssueInput[];
  unit: EffectiveUnit;
  coverage: CoverageMetric;
  periodEndStr: string; // YYYY-MM-DD
  now?: Date;
}

export function calculateSnapshotMetrics(
  input: CalculateSnapshotMetricsInput
): ProjectSnapshotMetrics {
  const { issues, unit, coverage, periodEndStr, now = new Date() } = input;
  const periodEndDate = new Date(`${periodEndStr}T23:59:59.999Z`);

  let doneAtEnd = 0;
  let openAtEnd = 0;
  let wipAtEnd = 0;
  let blockedAtEnd = 0;
  let overdueAtEnd = 0;
  let overSlaAtEnd = 0;
  let unassignedAtEnd = 0;

  let totalPoints = 0;
  let donePoints = 0;
  let totalEstimateSeconds = 0;
  let doneEstimateSeconds = 0;

  let totalAtEnd = 0;

  for (const issue of issues) {
    // If issue was created after the period end, it did not exist in this snapshot
    if (issue.createdAt && issue.createdAt.getTime() > periodEndDate.getTime()) {
      continue;
    }

    totalAtEnd++;
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    const currentlyDone = isDoneGroup(group);

    const pts = issue.points ?? 0;
    totalPoints += pts;

    const est = issue.originalEstimateSeconds ?? 0;
    totalEstimateSeconds += est;

    // Determine if issue was done at period end
    let wasDoneAtEnd = false;
    if (currentlyDone) {
      const resolved = resolveCompletionDate({
        status: issue.status,
        statusCategory: issue.statusCategory,
        statusChangedAt: issue.statusChangedAt,
        raw: issue.raw,
      });

      if (resolved.date) {
        wasDoneAtEnd = resolved.date.getTime() <= periodEndDate.getTime();
      } else if (issue.statusChangedAt) {
        wasDoneAtEnd = issue.statusChangedAt.getTime() <= periodEndDate.getTime();
      } else {
        wasDoneAtEnd = true;
      }
    }

    if (wasDoneAtEnd) {
      doneAtEnd++;
      donePoints += pts;
      doneEstimateSeconds += est;
    } else {
      openAtEnd++;

      if (isWipGroup(group)) {
        wipAtEnd++;
      }

      const isBlocked = group === "Blocked" || isBlockedStatus(issue.status);
      if (isBlocked) {
        blockedAtEnd++;
      }

      // Overdue: open and due date on or before period end
      if (issue.dueDate && issue.dueDate.getTime() <= periodEndDate.getTime()) {
        overdueAtEnd++;
      }

      // Over SLA
      const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
      const ageDays = businessDaysBetween(stateDate, now);
      const sla = slaForStatus(issue.status, issue.statusCategory);
      if (slaExceeded(ageDays, sla).exceeded) {
        overSlaAtEnd++;
      }

      // Unassigned
      if (!issue.assigneeJira || issue.assigneeJira.trim() === "") {
        unassignedAtEnd++;
      }
    }
  }

  let doneUnits = doneAtEnd;
  let totalUnits = totalAtEnd;
  let completionRatio = 0;

  if (unit === "points") {
    doneUnits = donePoints;
    totalUnits = totalPoints;
    completionRatio = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
  } else if (unit === "estimate") {
    doneUnits = doneEstimateSeconds;
    totalUnits = totalEstimateSeconds;
    completionRatio =
      totalEstimateSeconds > 0
        ? Math.round((doneEstimateSeconds / totalEstimateSeconds) * 100)
        : 0;
  } else {
    completionRatio = totalAtEnd > 0 ? Math.round((doneAtEnd / totalAtEnd) * 100) : 0;
  }

  return {
    openAtEnd,
    doneAtEnd,
    totalAtEnd,
    wipAtEnd,
    blockedAtEnd,
    overdueAtEnd,
    overSlaAtEnd,
    unassignedAtEnd,
    completionRatio,
    coverage,
    unit,
    doneUnits,
    totalUnits,
  };
}
