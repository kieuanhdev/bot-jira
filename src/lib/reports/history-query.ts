import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type {
  ProjectHistoryResponse,
  HistoryDataPoint,
  ReportPeriod,
  ReportUnit,
} from "./types";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { addDays, countDays } from "./period";
import { resolveProjectVersionFilter } from "./version";
import { fetchProjectReportIssues } from "./query-primitives";

export interface HistoryQueryParams {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
  unit?: ReportUnit | null;
}

export async function getProjectHistory(
  params: HistoryQueryParams
): Promise<ProjectHistoryResponse> {
  const normalizedKey = normalizeProjectKey(params.projectKey);
  const { period, versionId } = params;

  const resolvedVersion = await resolveProjectVersionFilter(normalizedKey, versionId);
  const { rawIssues } = await fetchProjectReportIssues(
    normalizedKey,
    resolvedVersion?.whereInput
  );

  const totalDays = countDays(period.from, period.to);
  const dataPoints: HistoryDataPoint[] = [];

  // Generate date list
  // If totalDays <= 31, daily points. If > 31, weekly downsampling
  const stepDays = totalDays > 45 ? 7 : 1;

  let curDateStr = period.from;
  const dates: string[] = [];
  while (curDateStr <= period.to) {
    dates.push(curDateStr);
    curDateStr = addDays(curDateStr, stepDays);
  }

  // Pre-resolve issues
  const resolvedIssues = rawIssues.map((issue) => {
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
    const windowEndStr = stepDays > 1 && idx < dates.length - 1 ? addDays(dates[idx + 1], -1) : dateStr;

    let createdCount = 0;
    let completedCount = 0;
    let throughput = 0;

    for (const item of resolvedIssues) {
      if (item.createdAt && isDateInPeriod(item.createdAt, dateStr, windowEndStr, period.timezone)) {
        createdCount++;
      }
      if (item.completedDate && isDateInPeriod(item.completedDate, dateStr, windowEndStr, period.timezone)) {
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
  if (rawIssues.length === 0) {
    dataSufficiencyWarning = "Chưa có dữ liệu task trong phạm vi được chọn.";
  } else if (dataPoints.every((d) => d.createdCount === 0 && d.completedCount === 0)) {
    dataSufficiencyWarning =
      "Không có sự kiện tạo mới hoặc hoàn thành nào trong khoảng thời gian này.";
  }

  return {
    projectKey: normalizedKey,
    period,
    dataPoints,
    dataSufficiencyWarning,
  };
}
