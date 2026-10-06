"use client";

import { useState, useMemo, useEffect } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  PieChart as PieChartIcon,
  Layers,
  PlayCircle,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  X,
  Clock,
  ExternalLink,
  SlidersHorizontal,
  Table as TableIcon,
  Workflow,
  RotateCcw,
  Calendar,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { REPORT_STATUS_GROUPS, REPORT_STATUS_STYLE } from "@/lib/reports/status";
import type {
  ReportStatusGroup,
  StatusDistributionItem,
  ReportUnit,
  ReportPeriod,
} from "@/lib/reports/types";

export type MetricDimension = "count" | "points" | "estimate";
export type ChartDisplayMode = "donut" | "pipeline" | "table";

interface StatusDistributionChartProps {
  distribution: StatusDistributionItem[];
  onSelectGroup?: (group: ReportStatusGroup | null) => void;
  onDrillDownToTasks?: (group: ReportStatusGroup) => void;
  selectedGroup?: ReportStatusGroup | null;
  unit?: ReportUnit | null;
  periodLabel?: string | null;
  period?: ReportPeriod | null;
}

const STORAGE_PREFS_KEY = "reports:status-chart:preferences-v1";

interface ChartPreferences {
  showStageSummary: boolean;
  showSecondaryMetrics: boolean;
  hideEmptyStatuses: boolean;
  hiddenGroups: ReportStatusGroup[];
}

const DEFAULT_PREFERENCES: ChartPreferences = {
  showStageSummary: true,
  showSecondaryMetrics: true,
  hideEmptyStatuses: true,
  hiddenGroups: [],
};

export function StatusDistributionChart({
  distribution,
  onSelectGroup,
  onDrillDownToTasks,
  selectedGroup,
  unit,
  periodLabel,
  period,
}: StatusDistributionChartProps) {
  const [metric, setMetric] = useState<MetricDimension>(() => {
    if (unit === "points") return "points";
    if (unit === "estimate") return "estimate";
    return "count";
  });
  const [displayMode, setDisplayMode] = useState<ChartDisplayMode>("donut");
  const [hoveredGroup, setHoveredGroup] = useState<ReportStatusGroup | null>(null);

  // Sync external unit prop to internal metric
  useEffect(() => {
    if (unit === "points") setMetric("points");
    else if (unit === "estimate") setMetric("estimate");
    else if (unit === "tasks") setMetric("count");
  }, [unit]);

  // User display preferences
  const [preferences, setPreferences] = useState<ChartPreferences>(DEFAULT_PREFERENCES);

  // Load preferences from localStorage on client mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_PREFS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPreferences((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Save preferences to localStorage
  const updatePreferences = (updater: (prev: ChartPreferences) => ChartPreferences) => {
    setPreferences((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors
      }
      return next;
    });
  };

  // Toggle hiding a specific status group from the chart
  const toggleGroupVisibility = (group: ReportStatusGroup) => {
    updatePreferences((prev) => {
      const isHidden = prev.hiddenGroups.includes(group);
      const nextHidden = isHidden
        ? prev.hiddenGroups.filter((g) => g !== group)
        : [...prev.hiddenGroups, group];
      return { ...prev, hiddenGroups: nextHidden };
    });
  };

  // Quick preset: show all
  const handleShowAllGroups = () => {
    updatePreferences((prev) => ({ ...prev, hiddenGroups: [] }));
  };

  // Quick preset: only open/in-progress work (hide Done)
  const handleOnlyOpenWork = () => {
    updatePreferences((prev) => ({
      ...prev,
      hiddenGroups: ["Done"],
    }));
  };

  // Filter distribution based on user's hidden groups
  const filteredDistribution = useMemo(() => {
    return distribution.filter((item) => !preferences.hiddenGroups.includes(item.group));
  }, [distribution, preferences.hiddenGroups]);

  // Overall sums across all visible distribution items
  const totals = useMemo(() => {
    let taskCount = 0;
    let points = 0;
    let estimateSeconds = 0;

    for (const item of filteredDistribution) {
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
  }, [filteredDistribution]);

  // Active total based on selected metric
  const currentTotal = useMemo(() => {
    switch (metric) {
      case "points":
        return totals.points;
      case "estimate":
        return totals.estimateHours;
      case "count":
      default:
        return totals.taskCount;
    }
  }, [metric, totals]);

  const unitLabel = useMemo(() => {
    switch (metric) {
      case "points":
        return "SP";
      case "estimate":
        return "giờ";
      case "count":
      default:
        return "task";
    }
  }, [metric]);

  // Compute item metrics with re-calculated percentages based on chosen dimension
  const enrichedItems = useMemo(() => {
    const items = filteredDistribution.map((item) => {
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

    if (preferences.hideEmptyStatuses) {
      return items.filter((i) => i.metricValue > 0 || i.count > 0);
    }

    return items;
  }, [filteredDistribution, metric, currentTotal, preferences.hideEmptyStatuses]);

  // Active items for charts (excluding zero-value ones in current metric)
  const chartActiveItems = useMemo(() => {
    return enrichedItems.filter((i) => i.metricValue > 0);
  }, [enrichedItems]);

  // Delivery Stages summary (Backlog, WIP, Blocked, Done)
  const stageStats = useMemo(() => {
    const getStageSum = (groups: ReportStatusGroup[]) => {
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
  }, [enrichedItems, metric, currentTotal]);

  // Focused item for dynamic center display
  const focusedGroup = hoveredGroup || selectedGroup;
  const focusedItem = useMemo(() => {
    if (!focusedGroup) return null;
    return enrichedItems.find((i) => i.group === focusedGroup) || null;
  }, [focusedGroup, enrichedItems]);

  const handleGroupClick = (group: ReportStatusGroup) => {
    if (selectedGroup === group) {
      onSelectGroup?.(null);
    } else {
      onSelectGroup?.(group);
    }
  };

  const handleClearFilter = () => {
    onSelectGroup?.(null);
  };

  const formatHours = (hours: number) => {
    if (hours >= 24) {
      const days = Math.round((hours / 8) * 10) / 10;
      return `${hours}h (~${days}d)`;
    }
    return `${hours}h`;
  };

  const activeHiddenCount = preferences.hiddenGroups.length;

  const formattedPeriodBadge = useMemo(() => {
    if (periodLabel) return periodLabel;
    if (period?.from && period?.to) {
      const formatDate = (s: string) => {
        const parts = s.split("-");
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return s;
      };
      return `${formatDate(period.from)} – ${formatDate(period.to)}`;
    }
    return null;
  }, [periodLabel, period]);

  const formattedPeriodEnd = useMemo(() => {
    if (!period?.to) return null;
    const parts = period.to.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return period.to;
  }, [period?.to]);

  return (
    <Card className="border-border shadow-sm overflow-hidden">
      {/* Header with Title and User Controls */}
      <CardHeader className="p-4 pb-3 border-b border-border/60 bg-card/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <PieChartIcon className="h-4 w-4" aria-hidden="true" />
                </div>
                <CardTitle className="text-base font-semibold text-foreground">
                  Task theo trạng thái
                </CardTitle>
              </div>

              {formattedPeriodBadge && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-muted/80 text-foreground border border-border/80 shadow-2xs">
                  <Calendar className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span>{formattedPeriodBadge}</span>
                </span>
              )}
            </div>

            <CardDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2">
              <span>Cơ cấu và luồng phân bổ công việc tại thời điểm cuối kỳ báo cáo</span>
              {formattedPeriodEnd && (
                <span className="font-medium text-foreground/80">
                  (Mốc chốt: {formattedPeriodEnd})
                </span>
              )}
            </CardDescription>
          </div>

          {/* Controls: Metric Dimension, Chart View & Display Options Dropdown */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {/* Metric Selector */}
            <div
              className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-xs text-muted-foreground"
              role="group"
              aria-label="Chọn đơn vị hiển thị"
            >
              <button
                type="button"
                onClick={() => setMetric("count")}
                aria-pressed={metric === "count"}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                  metric === "count"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "hover:text-foreground"
                }`}
              >
                <span>Task</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  ({totals.taskCount})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMetric("points")}
                aria-pressed={metric === "points"}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                  metric === "points"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "hover:text-foreground"
                }`}
                title="Story Points"
              >
                <span>SP</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  ({totals.points})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMetric("estimate")}
                aria-pressed={metric === "estimate"}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                  metric === "estimate"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "hover:text-foreground"
                }`}
                title="Thời lượng ước tính"
              >
                <Clock className="h-3 w-3" />
                <span>{totals.estimateHours}h</span>
              </button>
            </div>

            {/* Display Mode Switcher */}
            <div
              className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-xs text-muted-foreground"
              role="group"
              aria-label="Chọn chế độ biểu đồ"
            >
              <button
                type="button"
                onClick={() => setDisplayMode("donut")}
                aria-pressed={displayMode === "donut"}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
                  displayMode === "donut"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "hover:text-foreground"
                }`}
                title="Biểu đồ tròn (Donut)"
              >
                <PieChartIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Tròn</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode("pipeline")}
                aria-pressed={displayMode === "pipeline"}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
                  displayMode === "pipeline"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "hover:text-foreground"
                }`}
                title="Thanh luồng tiến trình"
              >
                <Workflow className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Luồng</span>
              </button>

              <button
                type="button"
                onClick={() => setDisplayMode("table")}
                aria-pressed={displayMode === "table"}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
                  displayMode === "table"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "hover:text-foreground"
                }`}
                title="Bảng chi tiết"
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Bảng</span>
              </button>
            </div>

            {/* User Custom Display Menu (Tùy chọn hiển thị) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 gap-1.5 px-2.5 text-xs cursor-pointer ${
                    activeHiddenCount > 0 || !preferences.showStageSummary || !preferences.showSecondaryMetrics
                      ? "border-teal-500/50 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                      : ""
                  }`}
                  aria-label="Tùy chỉnh nội dung hiển thị"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Tùy biến hiển thị</span>
                  {activeHiddenCount > 0 && (
                    <Badge variant="secondary" className="px-1 text-[10px] py-0">
                      -{activeHiddenCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64 p-2">
                <DropdownMenuLabel className="text-xs font-semibold text-foreground px-2 py-1">
                  Khối & Chi tiết hiển thị
                </DropdownMenuLabel>

                <DropdownMenuCheckboxItem
                  checked={preferences.showStageSummary}
                  onCheckedChange={(checked) =>
                    updatePreferences((prev) => ({ ...prev, showStageSummary: checked }))
                  }
                  className="text-xs cursor-pointer"
                >
                  Hiện dải 4 giai đoạn (Overview)
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                  checked={preferences.showSecondaryMetrics}
                  onCheckedChange={(checked) =>
                    updatePreferences((prev) => ({ ...prev, showSecondaryMetrics: checked }))
                  }
                  className="text-xs cursor-pointer"
                >
                  Hiện chi tiết SP & Giờ làm việc
                </DropdownMenuCheckboxItem>

                <DropdownMenuCheckboxItem
                  checked={preferences.hideEmptyStatuses}
                  onCheckedChange={(checked) =>
                    updatePreferences((prev) => ({ ...prev, hideEmptyStatuses: checked }))
                  }
                  className="text-xs cursor-pointer"
                >
                  Ẩn trạng thái có 0 task
                </DropdownMenuCheckboxItem>

                <DropdownMenuSeparator className="my-1.5" />

                <div className="flex items-center justify-between px-2 py-1">
                  <DropdownMenuLabel className="p-0 text-xs font-semibold text-foreground">
                    Lọc trạng thái
                  </DropdownMenuLabel>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={handleShowAllGroups}
                      className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      Hiện hết
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={handleOnlyOpenWork}
                      className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                    >
                      Bỏ Done
                    </button>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-0.5 pt-1">
                  {REPORT_STATUS_GROUPS.map((group) => {
                    const isVisible = !preferences.hiddenGroups.includes(group);
                    const style = REPORT_STATUS_STYLE[group];
                    const distItem = distribution.find((d) => d.group === group);
                    const count = distItem?.count ?? 0;

                    return (
                      <DropdownMenuCheckboxItem
                        key={group}
                        checked={isVisible}
                        onCheckedChange={() => toggleGroupVisibility(group)}
                        className="text-xs cursor-pointer justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${style?.dot}`} />
                          <span>{style?.label || group}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums ml-2">
                          ({count})
                        </span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </div>

                <DropdownMenuSeparator className="my-1.5" />

                <DropdownMenuItem
                  onClick={() => updatePreferences(() => DEFAULT_PREFERENCES)}
                  className="text-xs text-muted-foreground cursor-pointer flex items-center justify-between"
                >
                  <span>Khôi phục mặc định</span>
                  <RotateCcw className="h-3 w-3" />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Hidden Groups Notice Pill (nếu người dùng đang ẩn một số trạng thái) */}
        {activeHiddenCount > 0 && (
          <div className="mt-2.5 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <span className="text-[11px]">
              Đang ẩn <strong>{activeHiddenCount}</strong> trạng thái khỏi biểu đồ (
              {preferences.hiddenGroups.map((g) => REPORT_STATUS_STYLE[g]?.label || g).join(", ")})
            </span>
            <button
              type="button"
              onClick={handleShowAllGroups}
              className="text-[11px] font-semibold underline hover:opacity-80 cursor-pointer shrink-0 ml-2"
            >
              Hiện lại tất cả
            </button>
          </div>
        )}

        {/* Delivery Stage High-Level Overview Strip (Tùy chọn ẩn/hiện) */}
        {preferences.showStageSummary && (
          <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* 1. Tồn đọng (Backlog + To Do) */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                  <span className="truncate">Chờ làm</span>
                  <span className="font-semibold tabular-nums">{stageStats.backlog.pct}%</span>
                </div>
                <p className="truncate text-sm font-bold text-foreground">
                  {stageStats.backlog.val}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                </p>
              </div>
            </div>

            {/* 2. Đang làm (WIP) */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <PlayCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                  <span className="truncate">Đang làm (WIP)</span>
                  <span className="font-semibold tabular-nums">{stageStats.wip.pct}%</span>
                </div>
                <p className="truncate text-sm font-bold text-foreground">
                  {stageStats.wip.val}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                </p>
              </div>
            </div>

            {/* 3. Bị nghẽn (Blocked) */}
            <div
              className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                stageStats.blocked.count > 0
                  ? "border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10"
                  : "border-border/80 bg-muted/40 hover:bg-muted/70"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                  stageStats.blocked.count > 0
                    ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <AlertOctagon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                  <span className="truncate">Bị nghẽn</span>
                  {stageStats.blocked.count > 0 && (
                    <span className="inline-flex items-center rounded px-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10">
                      Cần gỡ
                    </span>
                  )}
                </div>
                <p
                  className={`truncate text-sm font-bold ${
                    stageStats.blocked.count > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-foreground"
                  }`}
                >
                  {stageStats.blocked.val}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                </p>
              </div>
            </div>

            {/* 4. Hoàn thành (Done) */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                  <span className="truncate">Hoàn thành</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {stageStats.done.pct}%
                  </span>
                </div>
                <p className="truncate text-sm font-bold text-foreground">
                  {stageStats.done.val}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Selected Filter Bar (if any group is selected) */}
        {selectedGroup && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  REPORT_STATUS_STYLE[selectedGroup]?.dot || "bg-teal-500"
                }`}
                aria-hidden="true"
              />
              <span className="text-foreground truncate">
                Đang lọc nhóm:{" "}
                <strong className="font-semibold">
                  {REPORT_STATUS_STYLE[selectedGroup]?.label || selectedGroup}
                </strong>{" "}
                (
                {enrichedItems.find((i) => i.group === selectedGroup)?.count ?? 0} task
                )
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(onDrillDownToTasks || onSelectGroup) && (
                <button
                  type="button"
                  onClick={() => {
                    if (onDrillDownToTasks && selectedGroup) {
                      onDrillDownToTasks(selectedGroup);
                    } else if (onSelectGroup) {
                      onSelectGroup(selectedGroup);
                    }
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  <span>Xem trong tab Công việc</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handleClearFilter}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                title="Bỏ lọc nhóm"
              >
                <X className="h-3.5 w-3.5" />
                <span>Bỏ lọc</span>
              </button>
            </div>
          </div>
        )}
      </CardHeader>

      {/* Main Content Area */}
      <CardContent className="p-4 pt-4">
        {totals.taskCount === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <PieChartIcon
                className="h-6 w-6 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Không có task hiển thị trong phạm vi đã chọn
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {activeHiddenCount > 0
                ? "Bạn đang ẩn một số trạng thái trong tùy biến hiển thị."
                : "Dữ liệu phân bố theo trạng thái sẽ xuất hiện sau khi đồng bộ các issue từ Jira."}
            </p>
            {activeHiddenCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowAllGroups}
                className="mt-3 text-xs"
              >
                Hiện lại tất cả trạng thái
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Display Mode 1: Donut + Interactive Ranked List */}
            {displayMode === "donut" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                {/* Donut Chart with Dynamic Interactive Centerpiece (5 cols on lg) */}
                <div className="relative flex flex-col items-center justify-center lg:col-span-5">
                  <div
                    className="relative h-64 w-full max-w-[280px] sm:h-72 sm:max-w-[320px]"
                    role="img"
                    aria-label={`Biểu đồ tròn phân bố ${currentTotal} ${unitLabel} theo trạng thái`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartActiveItems}
                          dataKey="metricValue"
                          nameKey="group"
                          cx="50%"
                          cy="50%"
                          innerRadius={78}
                          outerRadius={116}
                          paddingAngle={chartActiveItems.length > 1 ? 3 : 0}
                          stroke="var(--card)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          onMouseEnter={(_, index) => {
                            if (chartActiveItems[index]) {
                              setHoveredGroup(chartActiveItems[index].group);
                            }
                          }}
                          onMouseLeave={() => setHoveredGroup(null)}
                          onClick={(entry) => {
                            const group = (entry as { group?: ReportStatusGroup })?.group;
                            if (group) handleGroupClick(group);
                          }}
                          className={onSelectGroup ? "cursor-pointer" : undefined}
                        >
                          {chartActiveItems.map((item) => {
                            const isSelected = selectedGroup === item.group;
                            const isHovered = hoveredGroup === item.group;
                            const isDimmed =
                              (hoveredGroup && !isHovered) ||
                              (selectedGroup && !isSelected && !hoveredGroup);

                            return (
                              <Cell
                                key={item.group}
                                fill={item.style.chartColor}
                                opacity={isDimmed ? 0.35 : 1}
                                stroke={
                                  isSelected
                                    ? "var(--primary)"
                                    : isHovered
                                      ? "var(--foreground)"
                                      : "var(--card)"
                                }
                                strokeWidth={isSelected || isHovered ? 3 : 2}
                                className="transition-all duration-200"
                              />
                            );
                          })}
                        </Pie>

                        {/* Rich Hover Tooltip */}
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const data = payload[0].payload as (typeof enrichedItems)[0];
                            const style = data.style;

                            return (
                              <div className="space-y-1.5 rounded-lg border border-border bg-popover/95 p-3 text-xs text-popover-foreground shadow-xl backdrop-blur-sm min-w-44">
                                <div className="flex items-center gap-1.5 font-semibold text-foreground border-b border-border/60 pb-1.5">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full ${style.dot}`}
                                    aria-hidden="true"
                                  />
                                  <span>{style.label || data.group}</span>
                                  <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1">
                                    {data.calculatedPercentage}%
                                  </Badge>
                                </div>

                                <div className="space-y-1 pt-0.5 text-muted-foreground">
                                  <div className="flex justify-between items-center">
                                    <span>Số lượng task:</span>
                                    <span className="font-semibold text-foreground tabular-nums">
                                      {data.count} task
                                    </span>
                                  </div>
                                  {preferences.showSecondaryMetrics && (
                                    <>
                                      <div className="flex justify-between items-center">
                                        <span>Story Points:</span>
                                        <span className="font-semibold text-foreground tabular-nums">
                                          {data.points} SP
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center">
                                        <span>Thời gian (est):</span>
                                        <span className="font-semibold text-foreground tabular-nums">
                                          {data.hours}h
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>

                                {onSelectGroup && (
                                  <p className="mt-1 text-[10px] text-teal-600 dark:text-teal-400 font-medium italic pt-1 border-t border-border/40">
                                    Nhấp để lọc danh sách task →
                                  </p>
                                )}
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Dynamic Centerpiece */}
                    <div
                      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center p-2"
                      aria-hidden="true"
                    >
                      {focusedItem ? (
                        <>
                          <span
                            className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${focusedItem.style.bg} ${focusedItem.style.text}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${focusedItem.style.dot}`} />
                            {focusedItem.style.label}
                          </span>
                          <span className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">
                            {focusedItem.metricValue}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground">
                            {unitLabel} ({focusedItem.calculatedPercentage}%)
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
                            {currentTotal}
                          </span>
                          <span className="text-xs font-medium text-muted-foreground">
                            tổng {unitLabel}
                          </span>
                          <span className="mt-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {stageStats.done.pct}% Done
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="mt-1 text-[11px] text-muted-foreground text-center">
                    {focusedItem
                      ? "Nhấp vào phân đoạn để lọc công việc"
                      : "Rê chuột hoặc nhấp để xem chi tiết"}
                  </p>
                </div>

                {/* Ranked Status List with Interactive Rows (7 cols on lg) */}
                <div className="space-y-2 lg:col-span-7">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Chi tiết theo trạng thái
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {preferences.showSecondaryMetrics
                        ? `Tổng ${totals.taskCount} task • ${totals.points} SP • ${totals.estimateHours}h`
                        : `Tổng ${totals.taskCount} task`}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {enrichedItems.map((item) => {
                      const isSelected = selectedGroup === item.group;
                      const isHovered = hoveredGroup === item.group;

                      return (
                        <div
                          key={item.group}
                          onMouseEnter={() => setHoveredGroup(item.group)}
                          onMouseLeave={() => setHoveredGroup(null)}
                          onClick={() => handleGroupClick(item.group)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleGroupClick(item.group);
                            }
                          }}
                          className={`group relative flex flex-col rounded-lg border p-2.5 transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? "border-teal-500 bg-teal-500/10 shadow-xs ring-1 ring-teal-500"
                              : isHovered
                                ? "border-border bg-muted/80"
                                : "border-border/70 bg-card hover:bg-muted/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* Left: Status Dot & Label */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.style.dot}`}
                                aria-hidden="true"
                              />
                              <span className="truncate text-sm font-medium text-foreground">
                                {item.style.label}
                              </span>

                              {/* Warning tag for blocked */}
                              {item.group === "Blocked" && item.count > 0 && (
                                <Badge variant="danger" className="text-[10px] py-0 px-1.5">
                                  Nghẽn
                                </Badge>
                              )}
                            </div>

                            {/* Right: Dimension Values */}
                            <div className="flex items-center gap-3 shrink-0 text-right">
                              {/* Primary metric value */}
                              <div className="text-sm font-semibold tabular-nums text-foreground">
                                {item.metricValue}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {unitLabel}
                                </span>
                              </div>

                              {/* Secondary info pills (Task count, SP, Hours) */}
                              {preferences.showSecondaryMetrics && (
                                <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                                  <span>{item.count}t</span>
                                  <span>•</span>
                                  <span>{item.points}p</span>
                                  <span>•</span>
                                  <span>{item.hours}h</span>
                                </div>
                              )}

                              {/* Percentage */}
                              <div className="w-12 text-right text-xs font-bold tabular-nums text-muted-foreground group-hover:text-foreground">
                                {item.calculatedPercentage}%
                              </div>

                              {/* Arrow hint */}
                              <div
                                className={`shrink-0 transition-transform ${
                                  isSelected ? "translate-x-0.5 text-teal-600 dark:text-teal-400" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                                }`}
                              >
                                <ArrowRight className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full transition-all duration-300 motion-reduce:transition-none"
                                style={{
                                  width: `${item.calculatedPercentage}%`,
                                  backgroundColor: item.style.chartColor,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Display Mode 2: Pipeline / Workflow Stacked Bar */}
            {displayMode === "pipeline" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Workflow className="h-4 w-4 text-teal-500" />
                      Phân phối lũy kế theo luồng quy trình (Pipeline Flow)
                    </span>
                    <span className="text-muted-foreground">
                      Tổng {currentTotal} {unitLabel}
                    </span>
                  </div>

                  {/* Multi-segment stacked progress bar */}
                  <div className="flex h-5 w-full overflow-hidden rounded-lg bg-muted p-0.5 gap-0.5 shadow-inner">
                    {chartActiveItems.map((item) => (
                      <div
                        key={item.group}
                        onMouseEnter={() => setHoveredGroup(item.group)}
                        onMouseLeave={() => setHoveredGroup(null)}
                        onClick={() => handleGroupClick(item.group)}
                        style={{
                          width: `${item.calculatedPercentage}%`,
                          backgroundColor: item.style.chartColor,
                        }}
                        className={`h-full rounded-xs transition-all duration-200 cursor-pointer ${
                          hoveredGroup === item.group || selectedGroup === item.group
                            ? "brightness-110 ring-2 ring-foreground"
                            : "hover:opacity-90"
                        }`}
                        title={`${item.style.label}: ${item.metricValue} ${unitLabel} (${item.calculatedPercentage}%)`}
                      />
                    ))}
                  </div>

                  {/* Flow legend chips */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {enrichedItems.map((item) => {
                      const isSelected = selectedGroup === item.group;
                      const isHovered = hoveredGroup === item.group;

                      return (
                        <button
                          key={item.group}
                          type="button"
                          onClick={() => handleGroupClick(item.group)}
                          onMouseEnter={() => setHoveredGroup(item.group)}
                          onMouseLeave={() => setHoveredGroup(null)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                            isSelected
                              ? "border-teal-500 bg-teal-500/10 font-semibold text-foreground ring-1 ring-teal-500"
                              : isHovered
                                ? "border-border bg-muted text-foreground"
                                : "border-border/60 bg-card/60 text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${item.style.dot}`} />
                          <span className="text-foreground font-medium">{item.style.label}</span>
                          <span className="font-semibold text-foreground tabular-nums">
                            {item.metricValue}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            ({item.calculatedPercentage}%)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pipeline Stages Breakdown Matrix */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Backlog */}
                  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-sky-600 dark:text-sky-400">
                      <span>1. Chờ xử lý</span>
                      <span className="tabular-nums">{stageStats.backlog.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gồm <strong>Backlog</strong> & <strong>Chờ làm</strong>
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {stageStats.backlog.val}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                    </p>
                  </div>

                  {/* WIP */}
                  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-teal-600 dark:text-teal-400">
                      <span>2. Đang triển khai</span>
                      <span className="tabular-nums">{stageStats.wip.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Gồm <strong>Đang làm</strong>, <strong>Review</strong> & <strong>QA</strong>
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {stageStats.wip.val}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                    </p>
                  </div>

                  {/* Blocked */}
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      stageStats.blocked.count > 0
                        ? "border-rose-500/50 bg-rose-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
                      <span>3. Bị tắc nghẽn</span>
                      <span className="tabular-nums">{stageStats.blocked.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Task cần can thiệp tháo gỡ rào cản
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {stageStats.blocked.val}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                    </p>
                  </div>

                  {/* Done */}
                  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <span>4. Đã hoàn thành</span>
                      <span className="tabular-nums">{stageStats.done.pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Đã qua nghiệm thu hoặc đóng issue
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      {stageStats.done.val}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Display Mode 3: Detailed Table */}
            {displayMode === "table" && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
                      <th className="py-2.5 px-3">Trạng thái Jira</th>
                      <th className="py-2.5 px-3 text-right">Số lượng task</th>
                      {preferences.showSecondaryMetrics && (
                        <>
                          <th className="py-2.5 px-3 text-right">Story Points</th>
                          <th className="py-2.5 px-3 text-right">Thời gian ước tính</th>
                        </>
                      )}
                      <th className="py-2.5 px-3 text-right">Tỷ trọng ({unitLabel})</th>
                      <th className="py-2.5 px-3 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {enrichedItems.map((item) => {
                      const isSelected = selectedGroup === item.group;

                      return (
                        <tr
                          key={item.group}
                          className={`transition-colors hover:bg-muted/50 ${
                            isSelected ? "bg-teal-500/10 font-medium" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${item.style.dot}`} />
                              <span className="font-medium text-foreground">
                                {item.style.label}
                              </span>
                              {item.group === "Blocked" && item.count > 0 && (
                                <Badge variant="danger" className="text-[10px] py-0 px-1.5 ml-1">
                                  Cần gỡ
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium tabular-nums text-foreground">
                            {item.count}
                          </td>
                          {preferences.showSecondaryMetrics && (
                            <>
                              <td className="py-2.5 px-3 text-right font-medium tabular-nums text-foreground">
                                {item.points} SP
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium tabular-nums text-foreground">
                                {formatHours(item.hours)}
                              </td>
                            </>
                          )}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${item.calculatedPercentage}%`,
                                    backgroundColor: item.style.chartColor,
                                  }}
                                />
                              </div>
                              <span className="w-10 text-right font-semibold tabular-nums text-foreground">
                                {item.calculatedPercentage}%
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleGroupClick(item.group)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 cursor-pointer font-medium"
                            >
                              <span>{isSelected ? "Bỏ lọc" : "Lọc task"}</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/40 font-bold text-foreground">
                      <td className="py-2.5 px-3">Tổng cộng ({filteredDistribution.length} trạng thái)</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        {totals.taskCount} task
                      </td>
                      {preferences.showSecondaryMetrics && (
                        <>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {totals.points} SP
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {totals.estimateHours}h
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-3 text-right tabular-nums">100%</td>
                      <td className="py-2.5 px-3 text-center">-</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
