import type {
  ProjectFlowMetrics,
  MetricComparison,
  MetricComparisonItem,
  EffectiveUnit,
} from "./types";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";
import type { ReportIssueInput } from "./metrics";

export interface CalculateFlowMetricsInput {
  issues: ReportIssueInput[];
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  timezone: string;
  unit: EffectiveUnit;
  transitionEvents?: Array<{
    jiraKey: string;
    occurredAt: Date;
    fromStatusGroup?: string | null;
    toStatusGroup: string;
  }>;
}

export function calculateFlowMetrics(input: CalculateFlowMetricsInput): {
  flow: ProjectFlowMetrics;
  completedIssueKeys: Set<string>;
  createdIssueKeys: Set<string>;
  lowConfidenceCompletionsCount: number;
} {
  const { issues, from, to, timezone, unit, transitionEvents = [] } = input;

  let createdInPeriod = 0;
  let completedInPeriod = 0;
  let throughputPoints = 0;
  let throughputEstimateHours = 0;
  let lowConfidenceCompletionsCount = 0;

  const createdIssueKeys = new Set<string>();
  const completedIssueKeys = new Set<string>();

  // Map of transition done dates if available
  const transitionDoneMap = new Map<string, Date>();
  let statusTransitionsInPeriod = 0;
  let reopenedInPeriod = 0;

  for (const event of transitionEvents) {
    if (isDateInPeriod(event.occurredAt, from, to, timezone)) {
      statusTransitionsInPeriod++;
      if (event.fromStatusGroup === "Done" && event.toStatusGroup !== "Done") {
        reopenedInPeriod++;
      }
      if (event.toStatusGroup === "Done" && !transitionDoneMap.has(event.jiraKey)) {
        transitionDoneMap.set(event.jiraKey, event.occurredAt);
      }
    }
  }

  for (const issue of issues) {
    // Check if created in period
    if (isDateInPeriod(issue.createdAt, from, to, timezone)) {
      createdInPeriod++;
      createdIssueKeys.add(issue.jiraKey);
    }

    // Check if completed in period
    const transitionDoneDate = transitionDoneMap.get(issue.jiraKey) || null;
    const resolved = resolveCompletionDate({
      status: issue.status,
      statusCategory: issue.statusCategory,
      statusChangedAt: issue.statusChangedAt,
      raw: issue.raw,
      transitionDoneDate,
    });

    if (resolved.date && isDateInPeriod(resolved.date, from, to, timezone)) {
      completedInPeriod++;
      completedIssueKeys.add(issue.jiraKey);
      if (resolved.confidence === "low") {
        lowConfidenceCompletionsCount++;
      }

      if (issue.points) {
        throughputPoints += issue.points;
      }
      if (issue.originalEstimateSeconds) {
        throughputEstimateHours += Math.round(issue.originalEstimateSeconds / 3600);
      }
    }
  }

  const throughput =
    unit === "points"
      ? throughputPoints
      : unit === "estimate"
      ? throughputEstimateHours
      : completedInPeriod;

  const netBacklogChange = createdInPeriod - completedInPeriod;

  return {
    flow: {
      createdInPeriod,
      completedInPeriod,
      reopenedInPeriod,
      statusTransitionsInPeriod,
      throughput,
      throughputPoints,
      throughputEstimateHours,
      netBacklogChange,
    },
    completedIssueKeys,
    createdIssueKeys,
    lowConfidenceCompletionsCount,
  };
}

export function compareFlowMetrics(
  current: ProjectFlowMetrics,
  previous: ProjectFlowMetrics,
  currentSnapshot?: { wipAtEnd: number; blockedAtEnd: number; overdueAtEnd: number },
  previousSnapshot?: { wipAtEnd: number; blockedAtEnd: number; overdueAtEnd: number }
): MetricComparison {
  function makeItem(curr: number, prev: number): MetricComparisonItem {
    const delta = curr - prev;
    const percentChange = prev > 0 ? Math.round((delta / prev) * 100) : null;
    return { current: curr, previous: prev, delta, percentChange };
  }

  const wipCurr = currentSnapshot?.wipAtEnd ?? 0;
  const wipPrev = previousSnapshot?.wipAtEnd ?? 0;

  const blockedCurr = currentSnapshot?.blockedAtEnd ?? 0;
  const blockedPrev = previousSnapshot?.blockedAtEnd ?? 0;

  const overdueCurr = currentSnapshot?.overdueAtEnd ?? 0;
  const overduePrev = previousSnapshot?.overdueAtEnd ?? 0;

  return {
    created: makeItem(current.createdInPeriod, previous.createdInPeriod),
    completed: makeItem(current.completedInPeriod, previous.completedInPeriod),
    throughput: makeItem(current.throughput, previous.throughput),
    netBacklog: {
      current: current.netBacklogChange,
      previous: previous.netBacklogChange,
      delta: current.netBacklogChange - previous.netBacklogChange,
    },
    wip: {
      current: wipCurr,
      previous: wipPrev,
      delta: wipCurr - wipPrev,
    },
    blocked: {
      current: blockedCurr,
      previous: blockedPrev,
      delta: blockedCurr - blockedPrev,
    },
    overdue: {
      current: overdueCurr,
      previous: overduePrev,
      delta: overdueCurr - overduePrev,
    },
  };
}
