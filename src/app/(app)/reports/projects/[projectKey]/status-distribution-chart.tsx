"use client";

import { useState, useMemo } from "react";
import { PieChart as PieChartIcon, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ReportStatusGroup,
  StatusDistributionItem,
  ReportUnit,
  ReportPeriod,
} from "@/lib/reports/types";
import { DisplayModeToggle, DisplayOptionsMenu, MetricToggle } from "./status-chart/controls";
import { StatusDonutView } from "./status-chart/donut-view";
import { StatusChartEmptyState } from "./status-chart/empty-state";
import { HiddenGroupsNotice, SelectedGroupBar, StageSummaryStrip } from "./status-chart/header-panels";
import {
  computeStageStats,
  computeTotals,
  enrichItems,
  formatPeriodBadge,
  formatPeriodEnd,
  getCurrentTotal,
  getUnitLabel,
  type ChartDisplayMode,
  type MetricDimension,
} from "./status-chart/model";
import { StatusPipelineView } from "./status-chart/pipeline-view";
import { StatusTableView } from "./status-chart/table-view";
import { useStatusChartPreferences } from "./status-chart/use-status-chart-preferences";

export type { MetricDimension, ChartDisplayMode };

interface StatusDistributionChartProps {
  distribution: StatusDistributionItem[];
  onSelectGroup?: (group: ReportStatusGroup | null) => void;
  onDrillDownToTasks?: (group: ReportStatusGroup) => void;
  selectedGroup?: ReportStatusGroup | null;
  unit?: ReportUnit | null;
  periodLabel?: string | null;
  period?: ReportPeriod | null;
}


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
  const [prevUnit, setPrevUnit] = useState(unit);
  if (unit !== prevUnit) {
    setPrevUnit(unit);
    if (unit === "points") setMetric("points");
    else if (unit === "estimate") setMetric("estimate");
    else if (unit === "tasks") setMetric("count");
  }

  // User display preferences
  const {
    preferences,
    updatePreferences,
    toggleGroupVisibility,
    handleShowAllGroups,
    handleOnlyOpenWork,
  } = useStatusChartPreferences();

  // Filter distribution based on user's hidden groups
  const filteredDistribution = useMemo(() => {
    return distribution.filter((item) => !preferences.hiddenGroups.includes(item.group));
  }, [distribution, preferences.hiddenGroups]);

  // Overall sums across all visible distribution items
  const totals = useMemo(() => computeTotals(filteredDistribution), [filteredDistribution]);

  // Active total based on selected metric
  const currentTotal = useMemo(() => getCurrentTotal(metric, totals), [metric, totals]);

  const unitLabel = useMemo(() => getUnitLabel(metric), [metric]);

  // Compute item metrics with re-calculated percentages based on chosen dimension
  const enrichedItems = useMemo(
    () => enrichItems(filteredDistribution, metric, currentTotal, preferences.hideEmptyStatuses),
    [filteredDistribution, metric, currentTotal, preferences.hideEmptyStatuses]
  );

  // Active items for charts (excluding zero-value ones in current metric)
  const chartActiveItems = useMemo(() => {
    return enrichedItems.filter((i) => i.metricValue > 0);
  }, [enrichedItems]);

  // Delivery Stages summary (Backlog, WIP, Blocked, Done)
  const stageStats = useMemo(
    () => computeStageStats(enrichedItems, metric, currentTotal),
    [enrichedItems, metric, currentTotal]
  );

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

  const activeHiddenCount = preferences.hiddenGroups.length;

  const formattedPeriodBadge = useMemo(
    () => formatPeriodBadge(periodLabel, period),
    [periodLabel, period]
  );

  const formattedPeriodEnd = useMemo(() => formatPeriodEnd(period), [period]);

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
            <MetricToggle metric={metric} onChange={setMetric} totals={totals} />

            {/* Display Mode Switcher */}
            <DisplayModeToggle displayMode={displayMode} onChange={setDisplayMode} />

            {/* User Custom Display Menu (Tùy chọn hiển thị) */}
            <DisplayOptionsMenu
              distribution={distribution}
              preferences={preferences}
              updatePreferences={updatePreferences}
              toggleGroupVisibility={toggleGroupVisibility}
              onShowAll={handleShowAllGroups}
              onOnlyOpen={handleOnlyOpenWork}
            />
          </div>
        </div>

        {/* Hidden Groups Notice Pill (nếu người dùng đang ẩn một số trạng thái) */}
        {activeHiddenCount > 0 && (
          <HiddenGroupsNotice hiddenGroups={preferences.hiddenGroups} onShowAll={handleShowAllGroups} />
        )}

        {/* Delivery Stage High-Level Overview Strip (Tùy chọn ẩn/hiện) */}
        {preferences.showStageSummary && <StageSummaryStrip stageStats={stageStats} unitLabel={unitLabel} />}

        {/* Selected Filter Bar (if any group is selected) */}
        {selectedGroup && (
          <SelectedGroupBar
            selectedGroup={selectedGroup}
            selectedCount={enrichedItems.find((i) => i.group === selectedGroup)?.count ?? 0}
            onSelectGroup={onSelectGroup}
            onDrillDownToTasks={onDrillDownToTasks}
            onClearFilter={handleClearFilter}
          />
        )}
      </CardHeader>

      {/* Main Content Area */}
      <CardContent className="p-4 pt-4">
        {totals.taskCount === 0 ? (
          <StatusChartEmptyState activeHiddenCount={activeHiddenCount} onShowAll={handleShowAllGroups} />
        ) : (
          <div className="space-y-6">
            {/* Display Mode 1: Donut + Interactive Ranked List */}
            {displayMode === "donut" && (
              <StatusDonutView
                enrichedItems={enrichedItems}
                chartActiveItems={chartActiveItems}
                focusedItem={focusedItem}
                stageStats={stageStats}
                totals={totals}
                currentTotal={currentTotal}
                unitLabel={unitLabel}
                selectedGroup={selectedGroup}
                hoveredGroup={hoveredGroup}
                showSecondaryMetrics={preferences.showSecondaryMetrics}
                onSelectGroup={onSelectGroup}
                onHoverGroup={setHoveredGroup}
                onGroupClick={handleGroupClick}
              />
            )}

            {/* Display Mode 2: Pipeline / Workflow Stacked Bar */}
            {displayMode === "pipeline" && (
              <StatusPipelineView
                enrichedItems={enrichedItems}
                chartActiveItems={chartActiveItems}
                stageStats={stageStats}
                currentTotal={currentTotal}
                unitLabel={unitLabel}
                selectedGroup={selectedGroup}
                hoveredGroup={hoveredGroup}
                onHoverGroup={setHoveredGroup}
                onGroupClick={handleGroupClick}
              />
            )}

            {/* Display Mode 3: Detailed Table */}
            {displayMode === "table" && (
              <StatusTableView
                enrichedItems={enrichedItems}
                statusCount={filteredDistribution.length}
                totals={totals}
                unitLabel={unitLabel}
                selectedGroup={selectedGroup}
                showSecondaryMetrics={preferences.showSecondaryMetrics}
                onGroupClick={handleGroupClick}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
