import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type {
  ProjectHistoryResponse,
  ReportPeriod,
  ReportUnit,
} from "./types";
import { resolveProjectVersionFilter } from "./version";
import { fetchProjectReportIssues } from "./query-primitives";
import { calculateHistoryMetrics } from "./history-metrics";

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

  const { dataPoints, dataSufficiencyWarning } = calculateHistoryMetrics({
    issues: rawIssues,
    period,
  });

  return {
    projectKey: normalizedKey,
    period,
    dataPoints,
    dataSufficiencyWarning,
  };
}
