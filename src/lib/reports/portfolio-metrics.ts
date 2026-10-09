import type {
  ReportPeriod,
  ReportUnit,
  EffectiveUnit,
  HealthStatus,
  ProjectReportSummary,
  ProjectPortfolioResponse,
  ReportFreshness,
} from "./types";

export type PortfolioSummaryCounts = ProjectPortfolioResponse["summary"];
import {
  calculateCoverage,
  resolveEffectiveUnit,
  calculateProgress,
  type ReportIssueInput,
} from "./metrics";
import { calculateSnapshotMetrics } from "./current-metrics";
import { calculateFlowMetrics } from "./flow-metrics";
import { calculateProjectHealth } from "./health";

export interface PortfolioProjectSummaryInput {
  projectKey: string;
  projectName: string;
  period: ReportPeriod;
  periodLabel: string;
  mappedIssues: ReportIssueInput[];
  freshness: ReportFreshness;
  unit?: ReportUnit | null;
  lastSyncedAt?: Date | null;
  referenceRelease?: {
    id: string;
    name: string;
    releaseDate: string | null;
  } | null;
  now?: Date;
}

/**
 * Pure calculator for a single project summary in portfolio reporting.
 */
export function calculatePortfolioProjectSummary(
  input: PortfolioProjectSummaryInput
): ProjectReportSummary {
  const {
    projectKey,
    projectName,
    period,
    periodLabel,
    mappedIssues,
    freshness,
    unit = "auto",
    lastSyncedAt,
    referenceRelease,
    now = new Date(),
  } = input;

  const coverage = calculateCoverage(mappedIssues);
  const effectiveUnit: EffectiveUnit = resolveEffectiveUnit(unit, coverage);

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

  return {
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
    openAtEnd: snapshotAtEnd.openAtEnd,
    doneAtEnd: snapshotAtEnd.doneAtEnd,
    wipAtEnd: snapshotAtEnd.wipAtEnd,
    blockedAtEnd: snapshotAtEnd.blockedAtEnd,
    overdueAtEnd: snapshotAtEnd.overdueAtEnd,
    overSlaAtEnd: snapshotAtEnd.overSlaAtEnd,
    completionRatio: snapshotAtEnd.completionRatio,
    totalTasks: mappedIssues.length,
    doneTasks: snapshotAtEnd.doneAtEnd,
    blockedTasks: snapshotAtEnd.blockedAtEnd,
    overdueTasks: snapshotAtEnd.overdueAtEnd,
    overSlaTasks: snapshotAtEnd.overSlaAtEnd,
    createdInPeriod: flow.createdInPeriod,
    completedInPeriod: flow.completedInPeriod,
    netBacklogChange: flow.netBacklogChange,
    throughput: flow.throughput,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    referenceRelease: referenceRelease ?? null,
  };
}

const HEALTH_ORDER: Record<HealthStatus, number> = {
  at_risk: 0,
  attention: 1,
  unknown: 2,
  healthy: 3,
  completed: 4,
};

/**
 * Pure calculator for portfolio rollup metrics, filtering, and sorting.
 */
export function calculatePortfolioRollup(
  summaries: ProjectReportSummary[],
  filterHealth?: HealthStatus[]
): {
  projects: ProjectReportSummary[];
  summary: PortfolioSummaryCounts;
} {
  let filtered = [...summaries];
  if (filterHealth && filterHealth.length > 0) {
    const healthSet = new Set(filterHealth);
    filtered = filtered.filter((s) => healthSet.has(s.health));
  }

  // Sort: at_risk -> attention -> unknown -> healthy -> completed, then alphabetically by projectKey
  filtered.sort((a, b) => {
    const hDiff = HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health];
    if (hDiff !== 0) return hDiff;
    return a.projectKey.localeCompare(b.projectKey);
  });

  const summary: PortfolioSummaryCounts = {
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
    projects: filtered,
    summary,
  };
}
