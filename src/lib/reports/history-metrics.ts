import type { ReportPeriod, HistoryDataPoint } from "./types";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";
import { addDays, countDays } from "./period";

export interface HistoryIssueInput {
  jiraKey: string;
  status: string;
  statusCategory: string;
  statusChangedAt: Date | null;
  createdAt: Date | null;
  raw?: unknown;
  points?: number | null;
}

export interface HistoryMetricsInput {
  issues: HistoryIssueInput[];
  period: ReportPeriod;
}

export interface HistoryMetricsResult {
  dataPoints: HistoryDataPoint[];
  dataSufficiencyWarning: string | null;
}

/**
 * Pure calculator for project history trend data points and sufficiency warning.
 * Generates daily or weekly downsampled buckets and aggregates creation/completion counts.
 */
export function calculateHistoryMetrics(
  input: HistoryMetricsInput
): HistoryMetricsResult {
  const { issues, period } = input;

  const totalDays = countDays(period.from, period.to);
  const dataPoints: HistoryDataPoint[] = [];

  // If totalDays <= 45, daily points. If > 45, weekly downsampling (stepDays = 7)
  const stepDays = totalDays > 45 ? 7 : 1;

  let curDateStr = period.from;
  const dates: string[] = [];
  while (curDateStr <= period.to) {
    dates.push(curDateStr);
    curDateStr = addDays(curDateStr, stepDays);
  }

  // Pre-resolve issues
  const resolvedIssues = issues.map((issue) => {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    const isDone = isDoneGroup(group);
    const resolved = resolveCompletionDate({
      status: issue.status,
      statusCategory: issue.statusCategory,
      statusChangedAt: issue.statusChangedAt,
      raw: issue.raw,
    });
    return {
      jiraKey: issue.jiraKey,
      createdAt: issue.createdAt,
      completedDate: resolved.date,
      isDone,
      points: issue.points ?? 0,
    };
  });

  for (let idx = 0; idx < dates.length; idx++) {
    const dateStr = dates[idx];
    const windowEndStr =
      stepDays > 1 && idx < dates.length - 1 ? addDays(dates[idx + 1], -1) : dateStr;

    let createdCount = 0;
    let completedCount = 0;
    let throughput = 0;

    for (const item of resolvedIssues) {
      if (
        item.createdAt &&
        isDateInPeriod(item.createdAt, dateStr, windowEndStr, period.timezone)
      ) {
        createdCount++;
      }
      if (
        item.completedDate &&
        isDateInPeriod(item.completedDate, dateStr, windowEndStr, period.timezone)
      ) {
        completedCount++;
        throughput++;
      }
    }

    const netBacklog = createdCount - completedCount;

    dataPoints.push({
      date: dateStr,
      createdCount,
      completedCount,
      netBacklog,
      openCount: Math.max(0, resolvedIssues.filter((i) => !i.isDone).length),
      doneCount: Math.max(0, resolvedIssues.filter((i) => i.isDone).length),
      throughput,
    });
  }

  let dataSufficiencyWarning: string | null = null;
  if (issues.length === 0) {
    dataSufficiencyWarning = "Chưa có dữ liệu task trong phạm vi được chọn.";
  } else if (dataPoints.every((d) => d.createdCount === 0 && d.completedCount === 0)) {
    dataSufficiencyWarning =
      "Không có sự kiện tạo mới hoặc hoàn thành nào trong khoảng thời gian này.";
  }

  return {
    dataPoints,
    dataSufficiencyWarning,
  };
}
