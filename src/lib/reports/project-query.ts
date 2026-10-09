import { listActiveProjects, normalizeProjectKey } from "@/lib/jira/project-catalog";
import type {
  ProjectDetailResponse,
  ReportUnit,
  RiskTaskItem,
  RiskReason,
} from "./types";
import { getReportFreshness } from "./freshness";
import { evaluateRiskTask, sortRiskTasks } from "./risk-query";
import { resolveReportPeriod, getPeriodDisplayLabel } from "./period";
import { resolveProjectVersionFilter } from "./version";
import {
  fetchProjectReportIssues,
  fetchAvailableProjectVersions,
  fetchIssueTransitionEvents,
  getPeriodDateBounds,
} from "./query-primitives";
import { calculateProjectReportMetrics } from "./project-metrics";

export interface ProjectReportQueryParams {
  projectKey: string;
  period?: string | null;
  from?: string | null;
  to?: string | null;
  timezone?: string | null;
  versionId?: string | null;
  unit?: ReportUnit | null;
  includeSubtasks?: boolean;
  comparePrevious?: boolean;
}

export async function getProjectReportDetail(
  params: ProjectReportQueryParams
): Promise<ProjectDetailResponse | null> {
  const now = new Date();
  const normalizedKey = normalizeProjectKey(params.projectKey);

  const activeCatalog = await listActiveProjects();
  const projectItem = activeCatalog.find((p) => p.key === normalizedKey);
  if (!projectItem) {
    return null;
  }
  const projectName = projectItem.name || normalizedKey;

  // Resolve period and comparison period
  const { period, comparisonPeriod } = resolveReportPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
    timezone: params.timezone,
    now,
  });
  const periodLabel = getPeriodDisplayLabel(period);

  // Retrieve available versions from Release table
  const availableVersions = await fetchAvailableProjectVersions(normalizedKey);

  // Resolve version filter using unified resolver
  const resolvedVersion = await resolveProjectVersionFilter(normalizedKey, params.versionId);

  // Fetch all issues in the scope
  const { mappedIssues } = await fetchProjectReportIssues(
    normalizedKey,
    resolvedVersion?.whereInput
  );

  // Fetch transition events if available for current period
  const periodBounds = getPeriodDateBounds(period);
  const transitionEvents = await fetchIssueTransitionEvents(normalizedKey, periodBounds);

  // Fetch previous transition events if comparison period is active
  let prevTransitionEvents: typeof transitionEvents = [];
  if (params.comparePrevious !== false && comparisonPeriod) {
    const prevPeriodBounds = getPeriodDateBounds(comparisonPeriod);
    prevTransitionEvents = await fetchIssueTransitionEvents(normalizedKey, prevPeriodBounds);
  }

  // Freshness
  const freshness = await getReportFreshness();

  // Pure metric calculations
  const metrics = calculateProjectReportMetrics({
    mappedIssues,
    period,
    comparisonPeriod: params.comparePrevious !== false ? comparisonPeriod : null,
    transitionEvents,
    prevTransitionEvents,
    resolvedVersion,
    freshness,
    unit: params.unit ?? "auto",
    comparePrevious: params.comparePrevious !== false,
    now,
  });

  return {
    projectKey: normalizedKey,
    projectName,
    project: {
      key: normalizedKey,
      name: projectName,
    },
    generatedAt: now.toISOString(),
    timezone: period.timezone,
    period,
    periodLabel,
    comparisonPeriod: params.comparePrevious !== false ? comparisonPeriod : null,
    scope: {
      versionId: resolvedVersion?.versionId ?? null,
      versionName: resolvedVersion?.versionName ?? null,
      releaseDate: resolvedVersion?.releaseDate
        ? resolvedVersion.releaseDate.toISOString().split("T")[0]
        : null,
      unit: metrics.effectiveUnit,
      requestedUnit: params.unit ?? "auto",
      includeSubtasks: params.includeSubtasks ?? true,
      totalScopeIssues: mappedIssues.length,
    },
    availableVersions,
    snapshotAtEnd: metrics.snapshotAtEnd,
    flow: metrics.flow,
    comparison: metrics.comparison,
    health: metrics.health,
    statusDistribution: metrics.statusDistribution,
    workload: metrics.workload,
    bottlenecks: metrics.bottlenecks,
    topRisks: metrics.topRisks,
    dataQuality: metrics.dataQuality,
    freshness,
    kpis: {
      progress: metrics.progress,
      taskProgress: metrics.taskProgress,
      pointProgress: metrics.pointProgress,
      estimateProgress: metrics.estimateProgress,
      coverage: metrics.coverage,
      wipCount: metrics.snapshotAtEnd.wipAtEnd,
      blockedCount: metrics.snapshotAtEnd.blockedAtEnd,
      overdueCount: metrics.snapshotAtEnd.overdueAtEnd,
      overSlaCount: metrics.snapshotAtEnd.overSlaAtEnd,
      unassignedCount: metrics.snapshotAtEnd.unassignedAtEnd,
      scheduleGapPercentage: metrics.scheduleGapPercentage,
      timeElapsedPercentage: metrics.timeElapsedPercentage,
    },
  };
}

export interface ProjectRiskQueryParams {
  projectKey: string;
  versionId?: string | null;
  risk?: string | null;
  status?: string | null;
  assignee?: string | null;
  limit?: number;
  offset?: number;
}

export async function getProjectRiskTasks(params: ProjectRiskQueryParams) {
  const normalizedKey = normalizeProjectKey(params.projectKey);
  const now = new Date();

  const resolvedVersion = await resolveProjectVersionFilter(normalizedKey, params.versionId);
  const { mappedIssues } = await fetchProjectReportIssues(
    normalizedKey,
    resolvedVersion?.whereInput
  );

  const evaluated: RiskTaskItem[] = [];
  for (const issue of mappedIssues) {
    const riskItem = evaluateRiskTask(issue, now);
    if (riskItem) {
      if (params.risk && !riskItem.risks.includes(params.risk as RiskReason)) continue;
      if (params.status && riskItem.status !== params.status) continue;
      if (params.assignee) {
        if (params.assignee === "unassigned") {
          if (riskItem.assigneeJira) continue;
        } else if (riskItem.assigneeJira !== params.assignee) {
          continue;
        }
      }
      evaluated.push(riskItem);
    }
  }

  const sorted = sortRiskTasks(evaluated);
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const paged = sorted.slice(offset, offset + limit);

  return {
    tasks: paged,
    total: sorted.length,
    limit,
    offset,
  };
}
