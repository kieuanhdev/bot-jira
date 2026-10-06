import { REPORT_STATUS_STYLE } from "@/lib/reports/status";
import type { ReportPeriod, ReportStatusGroup, StatusDistributionItem } from "@/lib/reports/types";

export type MetricDimension = "count" | "points" | "estimate";
export type ChartDisplayMode = "donut" | "pipeline" | "table";

export interface ChartPreferences {
  showStageSummary: boolean;
  showSecondaryMetrics: boolean;
  hideEmptyStatuses: boolean;
  hiddenGroups: ReportStatusGroup[];
}

export const STORAGE_PREFS_KEY = "reports:status-chart:preferences-v1";

export const DEFAULT_PREFERENCES: ChartPreferences = {
  showStageSummary: true,
  showSecondaryMetrics: true,
  hideEmptyStatuses: true,
  hiddenGroups: [],
};

export interface StatusStyle {
  label: string;
  dot: string;
  text: string;
  bg: string;
  chartColor: string;
}

export interface EnrichedStatusItem extends StatusDistributionItem {
  hours: number;
  metricValue: number;
  calculatedPercentage: number;
  style: StatusStyle;
}

export interface StageStat {
  count: number;
  points: number;
  hours: number;
  val: number;
  pct: number;
}

export interface StageStats {
  backlog: StageStat;
  wip: StageStat;
  blocked: StageStat;
  done: StageStat;
}

export interface DistributionTotals {
  taskCount: number;
  points: number;
  estimateSeconds: number;
  estimateHours: number;
}

/** Overall sums across all visible distribution items. */
export function computeTotals(items: StatusDistributionItem[]): DistributionTotals {
  let taskCount = 0;
  let points = 0;
  let estimateSeconds = 0;

  for (const item of items) {
    taskCount += item.count || 0;
    points += item.points || 0;
    estimateSeconds += item.estimateSeconds || 0;
  }

  const estimateHours = Math.round(estimateSeconds / 3600);

  return {
    taskCount,
    points,
    estimateSeconds,
    estimateHours,
  };
}

/** Active total based on the selected metric. */
export function getCurrentTotal(metric: MetricDimension, totals: DistributionTotals): number {
  switch (metric) {
    case "points":
      return totals.points;
    case "estimate":
      return totals.estimateHours;
    case "count":
    default:
      return totals.taskCount;
  }
}

export function getUnitLabel(metric: MetricDimension): string {
  switch (metric) {
    case "points":
      return "SP";
    case "estimate":
      return "giờ";
    case "count":
    default:
      return "task";
  }
}

/** Compute item metrics with percentages re-calculated for the chosen dimension. */
export function enrichItems(
  items: StatusDistributionItem[],
  metric: MetricDimension,
  currentTotal: number,
  hideEmptyStatuses: boolean
): EnrichedStatusItem[] {
  const enriched = items.map((item) => {
    const hours = Math.round((item.estimateSeconds || 0) / 3600);
    let metricValue = item.count;
    if (metric === "points") metricValue = item.points || 0;
    if (metric === "estimate") metricValue = hours;

    const percentage =
      currentTotal > 0
        ? Math.round((metricValue / currentTotal) * 1000) / 10
        : 0;

    const style = REPORT_STATUS_STYLE[item.group] || {
      label: item.group,
      dot: "bg-muted-foreground",
      text: "text-foreground",
      bg: "bg-muted",
      chartColor: "var(--chart-1)",
    };

    return {
      ...item,
      hours,
      metricValue,
      calculatedPercentage: percentage,
      style,
    };
  });

  if (hideEmptyStatuses) {
    return enriched.filter((i) => i.metricValue > 0 || i.count > 0);
  }

  return enriched;
}

/** Delivery stages summary (Backlog, WIP, Blocked, Done). */
export function computeStageStats(
  enrichedItems: EnrichedStatusItem[],
  metric: MetricDimension,
  currentTotal: number
): StageStats {
  const getStageSum = (groups: ReportStatusGroup[]): StageStat => {
    const stageItems = enrichedItems.filter((i) => groups.includes(i.group));
    const count = stageItems.reduce((acc, curr) => acc + curr.count, 0);
    const points = stageItems.reduce((acc, curr) => acc + (curr.points || 0), 0);
    const hours = stageItems.reduce((acc, curr) => acc + curr.hours, 0);

    let val = count;
    if (metric === "points") val = points;
    if (metric === "estimate") val = hours;

    const pct =
      currentTotal > 0 ? Math.round((val / currentTotal) * 1000) / 10 : 0;

    return { count, points, hours, val, pct };
  };

  return {
    backlog: getStageSum(["Backlog", "To Do"]),
    wip: getStageSum(["In Progress", "In Review", "QA/Test"]),
    blocked: getStageSum(["Blocked"]),
    done: getStageSum(["Done"]),
  };
}

export function formatHours(hours: number): string {
  if (hours >= 24) {
    const days = Math.round((hours / 8) * 10) / 10;
    return `${hours}h (~${days}d)`;
  }
  return `${hours}h`;
}

function formatDateDmy(s: string): string {
  const parts = s.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return s;
}

export function formatPeriodBadge(
  periodLabel: string | null | undefined,
  period: ReportPeriod | null | undefined
): string | null {
  if (periodLabel) return periodLabel;
  if (period?.from && period?.to) {
    return `${formatDateDmy(period.from)} – ${formatDateDmy(period.to)}`;
  }
  return null;
}

export function formatPeriodEnd(period: ReportPeriod | null | undefined): string | null {
  if (!period?.to) return null;
  return formatDateDmy(period.to);
}
