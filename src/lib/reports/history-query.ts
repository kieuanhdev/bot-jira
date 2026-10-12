import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type {
  ProjectHistoryResponse,
  ReportPeriod,
  ReportUnit,
} from "./types";
import { resolveProjectVersionFilter } from "./version";
import { fetchProjectReportIssues } from "./query-primitives";
import { calculateHistoryMetrics } from "./history-metrics";
import { formatDateInTimezone } from "./period";

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

  let effectivePeriod = period;
  if (resolvedVersion && rawIssues.length > 0) {
    const datedValues = rawIssues.flatMap((issue) =>
      [issue.createdAt, issue.statusChangedAt, issue.updatedAt].filter(
        (value): value is Date => value instanceof Date
      )
    );
    if (datedValues.length > 0) {
      const earliest = new Date(Math.min(...datedValues.map((value) => value.getTime())));
      effectivePeriod = {
        ...period,
        preset: "custom",
        from: formatDateInTimezone(earliest, period.timezone),
        to: formatDateInTimezone(new Date(), period.timezone),
      };
    }
  }

  const { dataPoints, dataSufficiencyWarning } = calculateHistoryMetrics({
    issues: rawIssues,
    period: effectivePeriod,
  });

  return {
    projectKey: normalizedKey,
    period: effectivePeriod,
    dataPoints,
    dataSufficiencyWarning,
  };
}
