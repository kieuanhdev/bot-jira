import { listActiveProjects, normalizeProjectKey } from "@/lib/jira/project-catalog";
import type {
  ProjectDetailResponse,
  ReportUnit,
  EffectiveUnit,
  RiskTaskItem,
  RiskReason,
} from "./types";
import {
  calculateCoverage,
  resolveEffectiveUnit,
  calculateProgress,
  calculateStatusDistribution,
  calculateWorkload,
  calculateBottlenecks,
  calculateTimeElapsedAndGap,
} from "./metrics";
import { calculateSnapshotMetrics } from "./current-metrics";
import { calculateFlowMetrics, compareFlowMetrics } from "./flow-metrics";
import { calculateProjectHealth } from "./health";
import { getReportFreshness } from "./freshness";
import { evaluateRiskTask, sortRiskTasks } from "./risk-query";
import { resolveReportPeriod, getPeriodDisplayLabel } from "./period";
import { evaluateDataQuality } from "./data-quality";
import { resolveProjectVersionFilter } from "./version";
import {
  fetchProjectReportIssues,
  fetchAvailableProjectVersions,
  fetchIssueTransitionEvents,
  getPeriodDateBounds,
  filterIssuesForPeriod,
} from "./query-primitives";

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

  // Coverage and unit
  const coverage = calculateCoverage(mappedIssues);
  const effectiveUnit: EffectiveUnit = resolveEffectiveUnit(params.unit ?? "auto", coverage);

  // Fetch transition events if available for current period
  const periodBounds = getPeriodDateBounds(period);
  const transitionEvents = await fetchIssueTransitionEvents(normalizedKey, periodBounds);

  // Flow in period
  const { flow, lowConfidenceCompletionsCount, completedIssueKeys } = calculateFlowMetrics({
    issues: mappedIssues,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
    unit: effectiveUnit,
    transitionEvents,
  });

  // Tasks relevant to this reporting period (active, open, or completed within the period)
  const periodIssues = filterIssuesForPeriod(
    mappedIssues,
    periodBounds.startDate,
    periodBounds.endDate,
    completedIssueKeys
  );

  // Snapshot at end of period
  const snapshotAtEnd = calculateSnapshotMetrics({
    issues: periodIssues,
    unit: effectiveUnit,
    coverage,
    periodEndStr: period.to,
    now,
  });

  // Comparison period metrics
  let comparison = null;
  if (params.comparePrevious !== false && comparisonPeriod) {
    const prevPeriodBounds = getPeriodDateBounds(comparisonPeriod);
    const prevTransitionEvents = await fetchIssueTransitionEvents(
      normalizedKey,
      prevPeriodBounds
    );

    const prevFlowRes = calculateFlowMetrics({
      issues: mappedIssues,
      from: comparisonPeriod.from,
      to: comparisonPeriod.to,
      timezone: comparisonPeriod.timezone,
      unit: effectiveUnit,
      transitionEvents: prevTransitionEvents,
    });

    const prevPeriodIssues = filterIssuesForPeriod(
      mappedIssues,
      prevPeriodBounds.startDate,
      prevPeriodBounds.endDate,
      prevFlowRes.completedIssueKeys
    );

    const prevSnapshot = calculateSnapshotMetrics({
      issues: prevPeriodIssues,
      unit: effectiveUnit,
      coverage,
      periodEndStr: comparisonPeriod.to,
      now,
    });
    comparison = compareFlowMetrics(flow, prevFlowRes.flow, snapshotAtEnd, prevSnapshot);
  }

  // Freshness
  const freshness = await getReportFreshness();

  // Progress & Health
  const activeScopeIssues = resolvedVersion ? mappedIssues : periodIssues;
  const progress = calculateProgress(activeScopeIssues, effectiveUnit);
  const taskProgress = calculateProgress(activeScopeIssues, "tasks");
  const pointProgress = calculateProgress(activeScopeIssues, "points");
  const estimateProgress = calculateProgress(activeScopeIssues, "estimate");

  const { timeElapsedPercentage, scheduleGapPercentage } = calculateTimeElapsedAndGap(
    resolvedVersion?.startDate,
    resolvedVersion?.releaseDate,
    progress.percentage,
    now
  );

  const healthEval = calculateProjectHealth({
    issues: activeScopeIssues,
    progress,
    freshness,
    releaseDate: resolvedVersion?.releaseDate,
    startDate: resolvedVersion?.startDate,
    timeElapsedPercentage,
    scheduleGapPercentage,
    now,
  });

  // Data quality evaluation
  const dataQuality = evaluateDataQuality({
    freshness,
    lowConfidenceCompletionsCount,
    totalCompletedCount: flow.completedInPeriod,
    hasTransitionEvents: transitionEvents.length > 0,
    missingEstimateCount: activeScopeIssues.filter((i) => !i.points && !i.originalEstimateSeconds).length,
    totalCount: activeScopeIssues.length,
  });

  // Status distribution (at end of period), workload, bottlenecks
  const statusDistribution = calculateStatusDistribution(periodIssues, period.to, period.from);
  const workload = calculateWorkload(periodIssues);
  const bottlenecks = calculateBottlenecks(periodIssues, now);

  // Top risks
  const evaluatedRisks: RiskTaskItem[] = [];
  for (const issue of periodIssues) {
    const riskItem = evaluateRiskTask(issue, now);
    if (riskItem) {
      evaluatedRisks.push(riskItem);
    }
  }
  const topRisks = sortRiskTasks(evaluatedRisks).slice(0, 10);

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
      unit: effectiveUnit,
      requestedUnit: params.unit ?? "auto",
      includeSubtasks: params.includeSubtasks ?? true,
      totalScopeIssues: mappedIssues.length,
    },
    availableVersions,
    snapshotAtEnd,
    flow,
    comparison,
    health: healthEval,
    statusDistribution,
    workload,
    bottlenecks,
    topRisks,
    dataQuality,
    freshness,
    kpis: {
      progress,
      taskProgress,
      pointProgress,
      estimateProgress,
      coverage,
      wipCount: snapshotAtEnd.wipAtEnd,
      blockedCount: snapshotAtEnd.blockedAtEnd,
      overdueCount: snapshotAtEnd.overdueAtEnd,
      overSlaCount: snapshotAtEnd.overSlaAtEnd,
      unassignedCount: snapshotAtEnd.unassignedAtEnd,
      scheduleGapPercentage,
      timeElapsedPercentage,
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

