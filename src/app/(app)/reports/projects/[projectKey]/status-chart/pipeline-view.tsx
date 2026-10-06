import { Workflow } from "lucide-react";
import type { ReportStatusGroup } from "@/lib/reports/types";
import type { EnrichedStatusItem, StageStats } from "./model";

/** Stacked pipeline bar with legend chips and the four-stage breakdown. */
export function StatusPipelineView({
  enrichedItems,
  chartActiveItems,
  stageStats,
  currentTotal,
  unitLabel,
  selectedGroup,
  hoveredGroup,
  onHoverGroup,
  onGroupClick,
}: {
  enrichedItems: EnrichedStatusItem[];
  chartActiveItems: EnrichedStatusItem[];
  stageStats: StageStats;
  currentTotal: number;
  unitLabel: string;
  selectedGroup?: ReportStatusGroup | null;
  hoveredGroup: ReportStatusGroup | null;
  onHoverGroup: (group: ReportStatusGroup | null) => void;
  onGroupClick: (group: ReportStatusGroup) => void;
}) {
  return (
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
              onMouseEnter={() => onHoverGroup(item.group)}
              onMouseLeave={() => onHoverGroup(null)}
              onClick={() => onGroupClick(item.group)}
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
                onClick={() => onGroupClick(item.group)}
                onMouseEnter={() => onHoverGroup(item.group)}
                onMouseLeave={() => onHoverGroup(null)}
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
  );
}
