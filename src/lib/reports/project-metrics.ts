import type {
  ReportPeriod,
  ReportUnit,
  EffectiveUnit,
  CoverageMetric,
  ProgressMetric,
  ProjectSnapshotMetrics,
  ProjectFlowMetrics,
  MetricComparison,
  StatusDistributionItem,
  WorkloadItem,
  BottleneckItem,
  RiskTaskItem,
  ReportFreshness,
  DataQualityWarning,
} from "./types";
import {
  calculateCoverage,
  resolveEffectiveUnit,
  calculateProgress,
  calculateStatusDistribution,
  calculateWorkload,
  calculateBottlenecks,
  calculateTimeElapsedAndGap,
  type ReportIssueInput,
} from "./metrics";
import { calculateFlowMetrics, compareFlowMetrics } from "./flow-metrics";
import { calculateSnapshotMetrics } from "./current-metrics";
import { calculateProjectHealth, type HealthEvaluationResult } from "./health";
import { evaluateDataQuality } from "./data-quality";
import { evaluateRiskTask, sortRiskTasks } from "./risk-query";
import { getPeriodDateBounds, filterIssuesForPeriod } from "./query-primitives";

export interface ProjectReportMetricsInput {
  mappedIssues: ReportIssueInput[];
  period: ReportPeriod;
  comparisonPeriod?: ReportPeriod | null;
  transitionEvents?: Array<{
    jiraKey: string;
    occurredAt: Date;
    fromStatusGroup?: string | null;
    toStatusGroup: string;
  }>;
  prevTransitionEvents?: Array<{
    jiraKey: string;
    occurredAt: Date;
    fromStatusGroup?: string | null;
    toStatusGroup: string;
  }>;
  resolvedVersion?: {
    startDate?: Date | null;
    releaseDate?: Date | null;
    versionId?: string | null;
    versionName?: string | null;
  } | null;
  freshness: ReportFreshness;
  unit?: ReportUnit | null;
  comparePrevious?: boolean;
  now?: Date;
}

export interface ProjectReportMetricsResult {
  effectiveUnit: EffectiveUnit;
  coverage: CoverageMetric;
  flow: ProjectFlowMetrics;
  periodIssues: ReportIssueInput[];
  snapshotAtEnd: ProjectSnapshotMetrics;
  comparison: MetricComparison | null;
  progress: ProgressMetric;
  taskProgress: ProgressMetric;
  pointProgress: ProgressMetric;
  estimateProgress: ProgressMetric;
  timeElapsedPercentage: number | null;
  scheduleGapPercentage: number | null;
  health: HealthEvaluationResult;
  dataQuality: DataQualityWarning[];
  statusDistribution: StatusDistributionItem[];
  workload: WorkloadItem[];
  bottlenecks: BottleneckItem[];
  topRisks: RiskTaskItem[];
}

/**
 * Pure calculator for project report metrics.
 * Receives domain inputs (issues, events, freshness, dates) and computes all metrics without Prisma.
 */
export function calculateProjectReportMetrics(
  input: ProjectReportMetricsInput
): ProjectReportMetricsResult {
  const {
    mappedIssues,
    period,
    comparisonPeriod,
    transitionEvents = [],
    prevTransitionEvents = [],
    resolvedVersion,
    freshness,
    unit = "auto",
    comparePrevious = true,
    now = new Date(),
  } = input;

  // Coverage and unit
  const coverage = calculateCoverage(mappedIssues);
  const effectiveUnit: EffectiveUnit = resolveEffectiveUnit(unit, coverage);

  // Flow in period
  const periodBounds = getPeriodDateBounds(period);
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
  let comparison: MetricComparison | null = null;
  if (comparePrevious !== false && comparisonPeriod) {
    const prevPeriodBounds = getPeriodDateBounds(comparisonPeriod);
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

  const health = calculateProjectHealth({
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
    missingEstimateCount: activeScopeIssues.filter(
      (i) => !i.points && !i.originalEstimateSeconds
    ).length,
    totalCount: activeScopeIssues.length,
  });

  // Status distribution, workload, bottlenecks
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
    effectiveUnit,
    coverage,
    flow,
    periodIssues,
    snapshotAtEnd,
    comparison,
    progress,
    taskProgress,
    pointProgress,
    estimateProgress,
    timeElapsedPercentage,
    scheduleGapPercentage,
    health,
    dataQuality,
    statusDistribution,
    workload,
    bottlenecks,
    topRisks,
  };
}
