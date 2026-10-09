import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { ProjectMembersResponse, ReportPeriod, ReportUnit, EffectiveUnit } from "./types";
import { calculateMemberMetrics } from "./member-metrics";
import { calculateCoverage, resolveEffectiveUnit } from "./metrics";
import { resolveProjectVersionFilter } from "./version";
import { fetchProjectReportIssues, fetchAssigneeDisplayNameMap } from "./query-primitives";

export interface MemberQueryParams {
  projectKey: string;
  period: ReportPeriod;
  comparisonPeriod: ReportPeriod | null;
  versionId?: string | null;
  unit?: ReportUnit | null;
}

export async function getProjectMembers(
  params: MemberQueryParams
): Promise<ProjectMembersResponse> {
  const normalizedKey = normalizeProjectKey(params.projectKey);
  const { period, comparisonPeriod, versionId } = params;

  const resolvedVersion = await resolveProjectVersionFilter(normalizedKey, versionId);
  const { mappedIssues } = await fetchProjectReportIssues(
    normalizedKey,
    resolvedVersion?.whereInput
  );

  const coverage = calculateCoverage(mappedIssues);
  const effectiveUnit: EffectiveUnit = resolveEffectiveUnit(params.unit ?? "auto", coverage);

  // Retrieve user display names
  const userMap = await fetchAssigneeDisplayNameMap(
    mappedIssues.map((i) => i.assigneeJira)
  );

  // Previous period completions if comparison period exists
  let previousCompletions: Map<string, number> | undefined;
  if (comparisonPeriod) {
    const prevMetrics = calculateMemberMetrics({
      issues: mappedIssues,
      from: comparisonPeriod.from,
      to: comparisonPeriod.to,
      timezone: comparisonPeriod.timezone,
      userDisplayNames: userMap,
    });
    previousCompletions = new Map(prevMetrics.map((m) => [m.assignee, m.completedTasks]));
  }

  const members = calculateMemberMetrics({
    issues: mappedIssues,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
    userDisplayNames: userMap,
    previousPeriodCompletions: previousCompletions,
  });

  return {
    members,
    period,
    comparisonPeriod,
    unit: effectiveUnit,
  };
}
