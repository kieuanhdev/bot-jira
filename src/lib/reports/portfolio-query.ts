import { listActiveProjects } from "@/lib/jira/project-catalog";
import type {
  ProjectReportSummary,
  ProjectPortfolioResponse,
  ReportUnit,
  HealthStatus,
  EffectiveUnit,
} from "./types";
import {
  calculateCoverage,
  resolveEffectiveUnit,
  calculateProgress,
} from "./metrics";
import { calculateSnapshotMetrics } from "./current-metrics";
import { calculateFlowMetrics } from "./flow-metrics";
import { calculateProjectHealth } from "./health";
import { getReportFreshness } from "./freshness";
import { resolveReportPeriod, getPeriodDisplayLabel } from "./period";
import {
  resolveScopedProjectKeys,
  fetchReferenceRelease,
  fetchPortfolioProjectIssues,
} from "./query-primitives";

export interface PortfolioQueryParams {
  allowedProjects: string[];
  filterProjects?: string[];
  filterHealth?: HealthStatus[];
  unit?: ReportUnit;
  period?: string | null;
  from?: string | null;
  to?: string | null;
  timezone?: string | null;
}

export async function getProjectPortfolio(
  params: PortfolioQueryParams
): Promise<ProjectPortfolioResponse> {
  const now = new Date();
  const activeCatalog = await listActiveProjects();
  const catalogMap = new Map(activeCatalog.map((p) => [p.key, p.name]));

  // Intersect allowedProjects with requested filterProjects
  const projectKeys = resolveScopedProjectKeys(params.allowedProjects, params.filterProjects);

  // Resolve period
  const { period } = resolveReportPeriod({
    period: params.period,
    from: params.from,
    to: params.to,
    timezone: params.timezone,
    now,
  });
  const periodLabel = getPeriodDisplayLabel(period);

  const freshness = await getReportFreshness();

  const summaries: ProjectReportSummary[] = [];

  for (const projectKey of projectKeys) {
    const projectName = catalogMap.get(projectKey) || projectKey;

    // Optional reference release (purely informational, not for scope filtering)
    const referenceRelease = await fetchReferenceRelease(projectKey);

    // Query entire project scope (NOT filtered by active release!)
    const { mappedIssues, lastSyncedAt } = await fetchPortfolioProjectIssues(projectKey);

    const coverage = calculateCoverage(mappedIssues);
    const effectiveUnit: EffectiveUnit = resolveEffectiveUnit(params.unit ?? "auto", coverage);

    // Snapshot at end of period
    const snapshotAtEnd = calculateSnapshotMetrics({
      issues: mappedIssues,
      unit: effectiveUnit,
      coverage,
      periodEndStr: period.to,
      now,
    });

    // Flow in period
    const { flow } = calculateFlowMetrics({
      issues: mappedIssues,
      from: period.from,
      to: period.to,
      timezone: period.timezone,
      unit: effectiveUnit,
    });

    // Health evaluation (operational mode)
    const progress = calculateProgress(mappedIssues, effectiveUnit);
    const healthEval = calculateProjectHealth({
      issues: mappedIssues,
      progress,
      freshness,
      now,
    });

    const summary: ProjectReportSummary = {
      projectKey,
      projectName,
      period,
      periodLabel,
      health: healthEval.status,
      healthHeadline: healthEval.headline,
      healthReasons: healthEval.reasons,
      progress,
      unit: effectiveUnit,
      recommendedUnit: coverage.recommendedUnit,
      coverage,
      // Snapshot
      openAtEnd: snapshotAtEnd.openAtEnd,
      doneAtEnd: snapshotAtEnd.doneAtEnd,
      wipAtEnd: snapshotAtEnd.wipAtEnd,
      blockedAtEnd: snapshotAtEnd.blockedAtEnd,
      overdueAtEnd: snapshotAtEnd.overdueAtEnd,
      overSlaAtEnd: snapshotAtEnd.overSlaAtEnd,
      completionRatio: snapshotAtEnd.completionRatio,
      // Legacy counts
      totalTasks: mappedIssues.length,
      doneTasks: snapshotAtEnd.doneAtEnd,
      blockedTasks: snapshotAtEnd.blockedAtEnd,
      overdueTasks: snapshotAtEnd.overdueAtEnd,
      overSlaTasks: snapshotAtEnd.overSlaAtEnd,
      // Flow
      createdInPeriod: flow.createdInPeriod,
      completedInPeriod: flow.completedInPeriod,
      netBacklogChange: flow.netBacklogChange,
      throughput: flow.throughput,
      lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
      referenceRelease: referenceRelease
        ? {
            id: referenceRelease.id,
            name: referenceRelease.name,
            releaseDate: referenceRelease.releaseDate,
          }
        : null,
    };

    summaries.push(summary);
  }

  // Filter by health if specified
  let filtered = summaries;
  if (params.filterHealth && params.filterHealth.length > 0) {
    const healthSet = new Set(params.filterHealth);
    filtered = filtered.filter((s) => healthSet.has(s.health));
  }

  // Sort: at_risk -> attention -> unknown -> healthy -> completed
  const healthOrder: Record<HealthStatus, number> = {
    at_risk: 0,
    attention: 1,
    unknown: 2,
    healthy: 3,
    completed: 4,
  };

  filtered.sort((a, b) => {
    const hDiff = healthOrder[a.health] - healthOrder[b.health];
    if (hDiff !== 0) return hDiff;
    return a.projectKey.localeCompare(b.projectKey);
  });

  const summaryCounts = {
    total: summaries.length,
    totalProjects: summaries.length,
    healthy: summaries.filter((s) => s.health === "healthy").length,
    attention: summaries.filter((s) => s.health === "attention").length,
    atRisk: summaries.filter((s) => s.health === "at_risk").length,
    completed: summaries.filter((s) => s.health === "completed").length,
    unknown: summaries.filter((s) => s.health === "unknown").length,
    completedInPeriod: summaries.reduce((acc, s) => acc + s.completedInPeriod, 0),
    blockedAtEnd: summaries.reduce((acc, s) => acc + s.blockedAtEnd, 0),
  };

  return {
    generatedAt: now.toISOString(),
    timezone: period.timezone,
    period,
    periodLabel,
    freshness,
    summary: summaryCounts,
    projects: filtered,
  };
}
