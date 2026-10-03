import type {
  EffectiveUnit,
  ReportUnit,
  ProgressMetric,
  CoverageMetric,
  StatusDistributionItem,
  WorkloadItem,
  BottleneckItem,
  ReportStatusGroup,
} from "./types";
import {
  normalizeStatusToGroup,
  isDoneGroup,
  isWipGroup,
  REPORT_STATUS_GROUPS,
} from "./status";
import { resolveCompletionDate } from "./completion-date";
import { businessDaysBetween } from "@/lib/stale/business-days";
import { slaForStatus, slaExceeded, isBlockedStatus } from "@/lib/stale/sla";

export interface ReportIssueInput {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  statusChangedAt: Date | null;
  assigneeJira: string | null;
  priority: string;
  points: number | null;
  originalEstimateSeconds: number | null;
  timeSpent: number | null;
  dueDate: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  labels: string[];
  raw?: unknown;
}

/**
 * Pure calculation functions for Project Reporting (Section 5, RPT-101)
 */

export function calculateCoverage(issues: ReportIssueInput[]): CoverageMetric {
  const total = issues.length;
  if (total === 0) {
    return {
      pointsCoverage: 0,
      estimateCoverage: 0,
      recommendedUnit: "tasks",
    };
  }

  const withPoints = issues.filter((i) => i.points !== null && i.points !== undefined).length;
  const withEstimate = issues.filter(
    (i) => i.originalEstimateSeconds !== null && i.originalEstimateSeconds !== undefined
  ).length;

  const pointsCoverage = Math.round((withPoints / total) * 100);
  const estimateCoverage = Math.round((withEstimate / total) * 100);

  let recommendedUnit: EffectiveUnit = "tasks";
  if (pointsCoverage >= 80) {
    recommendedUnit = "points";
  } else if (estimateCoverage >= 80) {
    recommendedUnit = "estimate";
  }

  return {
    pointsCoverage,
    estimateCoverage,
    recommendedUnit,
  };
}

export function resolveEffectiveUnit(
  requestedUnit: ReportUnit | null | undefined,
  coverage: CoverageMetric
): EffectiveUnit {
  if (!requestedUnit || requestedUnit === "auto") {
    return coverage.recommendedUnit;
  }
  return requestedUnit;
}

export function calculateProgress(
  issues: ReportIssueInput[],
  unit: EffectiveUnit
): ProgressMetric {
  if (issues.length === 0) {
    return {
      percentage: null,
      done: 0,
      total: 0,
      unit,
    };
  }

  if (unit === "points") {
    let totalPoints = 0;
    let donePoints = 0;
    for (const issue of issues) {
      const pts = issue.points ?? 0;
      totalPoints += pts;
      const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
      if (isDoneGroup(group)) {
        donePoints += pts;
      }
    }
    const percentage = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : null;
    return {
      percentage,
      done: donePoints,
      total: totalPoints,
      unit: "points",
    };
  }

  if (unit === "estimate") {
    let totalEst = 0;
    let doneEst = 0;
    for (const issue of issues) {
      const est = issue.originalEstimateSeconds ?? 0;
      totalEst += est;
      const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
      if (isDoneGroup(group)) {
        doneEst += est;
      }
    }
    const percentage = totalEst > 0 ? Math.round((doneEst / totalEst) * 100) : null;
    return {
      percentage,
      done: Math.round(doneEst / 3600), // convert to hours for display
      total: Math.round(totalEst / 3600),
      unit: "estimate",
    };
  }

  // Unit: "tasks"
  const total = issues.length;
  let done = 0;
  for (const issue of issues) {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    if (isDoneGroup(group)) {
      done++;
    }
  }
  const percentage = total > 0 ? Math.round((done / total) * 100) : null;
  return {
    percentage,
    done,
    total,
    unit: "tasks",
  };
}

export function calculateStatusDistribution(
  issues: ReportIssueInput[],
  periodEndStr?: string | null,
  periodStartStr?: string | null
): StatusDistributionItem[] {
  const periodEndDate = periodEndStr ? new Date(`${periodEndStr}T23:59:59.999Z`) : null;
  const periodStartDate = periodStartStr ? new Date(`${periodStartStr}T00:00:00.000Z`) : null;

  const filtered = issues.filter((i) => {
    if (periodEndDate && i.createdAt && i.createdAt.getTime() > periodEndDate.getTime()) {
      return false;
    }

    if (periodStartDate) {
      const group = normalizeStatusToGroup(i.status, i.statusCategory);
      if (isDoneGroup(group)) {
        const resolved = resolveCompletionDate({
          status: i.status,
          statusCategory: i.statusCategory,
          statusChangedAt: i.statusChangedAt,
          raw: i.raw,
        });

        const completionDate = resolved.date || i.statusChangedAt;
        if (completionDate) {
          if (completionDate.getTime() < periodStartDate.getTime()) {
            return false;
          }
        } else if (i.updatedAt && i.updatedAt.getTime() < periodStartDate.getTime()) {
          return false;
        }
      }
    }

    return true;
  });

  const totalCount = filtered.length;
  const map = new Map<
    ReportStatusGroup,
    { count: number; points: number; estimateSeconds: number }
  >();

  for (const group of REPORT_STATUS_GROUPS) {
    map.set(group, { count: 0, points: 0, estimateSeconds: 0 });
  }

  for (const issue of filtered) {
    let group = normalizeStatusToGroup(issue.status, issue.statusCategory);

    if (periodEndDate && group === "Done") {
      if (issue.statusChangedAt && issue.statusChangedAt.getTime() > periodEndDate.getTime()) {
        group = "In Progress";
      }
    }

    const item = map.get(group)!;
    item.count++;
    item.points += issue.points ?? 0;
    item.estimateSeconds += issue.originalEstimateSeconds ?? 0;
  }

  return REPORT_STATUS_GROUPS.map((group) => {
    const data = map.get(group)!;
    return {
      group,
      count: data.count,
      points: data.points,
      estimateSeconds: data.estimateSeconds,
      percentage: totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0,
    };
  });
}

export function calculateWorkload(
  issues: ReportIssueInput[],
  now: Date = new Date()
): WorkloadItem[] {
  const map = new Map<string, WorkloadItem>();

  for (const issue of issues) {
    const key = issue.assigneeJira ? issue.assigneeJira.trim() : "unassigned";
    const displayName = issue.assigneeJira ? issue.assigneeJira.trim() : "Chưa phân công";

    if (!map.has(key)) {
      map.set(key, {
        assignee: key,
        displayName,
        totalTasks: 0,
        doneTasks: 0,
        inProgressTasks: 0,
        blockedTasks: 0,
        overSlaTasks: 0,
        points: 0,
        estimateSeconds: 0,
      });
    }

    const item = map.get(key)!;
    item.totalTasks++;
    item.points += issue.points ?? 0;
    item.estimateSeconds += issue.originalEstimateSeconds ?? 0;

    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    if (isDoneGroup(group)) {
      item.doneTasks++;
    } else {
      if (isWipGroup(group)) {
        item.inProgressTasks++;
      }
      if (group === "Blocked" || isBlockedStatus(issue.status)) {
        item.blockedTasks++;
      }

      // Check SLA
      const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
      const ageDays = businessDaysBetween(stateDate, now);
      const sla = slaForStatus(issue.status, issue.statusCategory);
      const { exceeded } = slaExceeded(ageDays, sla);
      if (exceeded) {
        item.overSlaTasks++;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalTasks - a.totalTasks);
}

export function calculateBottlenecks(
  issues: ReportIssueInput[],
  now: Date = new Date()
): BottleneckItem[] {
  const statusMap = new Map<
    string,
    {
      status: string;
      statusGroup: ReportStatusGroup;
      taskCount: number;
      overSlaCount: number;
      totalAgeDays: number;
    }
  >();

  for (const issue of issues) {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    // Bottlenecks only apply to non-done tasks
    if (isDoneGroup(group)) continue;

    const statusName = issue.status.trim() || "Chưa có trạng thái";
    if (!statusMap.has(statusName)) {
      statusMap.set(statusName, {
        status: statusName,
        statusGroup: group,
        taskCount: 0,
        overSlaCount: 0,
        totalAgeDays: 0,
      });
    }

    const entry = statusMap.get(statusName)!;
    entry.taskCount++;

    const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
    const ageDays = businessDaysBetween(stateDate, now);
    entry.totalAgeDays += ageDays;

    const sla = slaForStatus(issue.status, issue.statusCategory);
    const { exceeded } = slaExceeded(ageDays, sla);
    if (exceeded) {
      entry.overSlaCount++;
    }
  }

  return Array.from(statusMap.values())
    .map((item) => ({
      status: item.status,
      statusGroup: item.statusGroup,
      taskCount: item.taskCount,
      overSlaCount: item.overSlaCount,
      avgStateAgeDays: item.taskCount > 0 ? Math.round(item.totalAgeDays / item.taskCount) : 0,
    }))
    .sort((a, b) => b.overSlaCount - a.overSlaCount || b.taskCount - a.taskCount);
}

export function calculateTimeElapsedAndGap(
  startDate: Date | null | undefined,
  releaseDate: Date | null | undefined,
  progressPercentage: number | null,
  now: Date = new Date()
): { timeElapsedPercentage: number | null; scheduleGapPercentage: number | null } {
  if (!releaseDate) {
    return { timeElapsedPercentage: null, scheduleGapPercentage: null };
  }

  const start = startDate ? new Date(startDate) : null;
  const end = new Date(releaseDate);

  if (!start) {
    // If no start date, we can't reliably compute elapsed business days ratio
    return { timeElapsedPercentage: null, scheduleGapPercentage: null };
  }

  const totalBusinessDays = businessDaysBetween(start, end);
  if (totalBusinessDays <= 0) {
    return { timeElapsedPercentage: 100, scheduleGapPercentage: null };
  }

  const elapsedBusinessDays = businessDaysBetween(start, now);
  const timeElapsedPercentage = Math.min(
    100,
    Math.max(0, Math.round((elapsedBusinessDays / totalBusinessDays) * 100))
  );

  const scheduleGapPercentage =
    progressPercentage !== null ? timeElapsedPercentage - progressPercentage : null;

  return { timeElapsedPercentage, scheduleGapPercentage };
}
