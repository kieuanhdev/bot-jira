"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  CheckCircle,
  PlayCircle,
  AlertOctagon,
  Clock,
  ShieldAlert,
  FolderPlus,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ProgressMetric,
  CoverageMetric,
  ProjectSnapshotMetrics,
  ProjectFlowMetrics,
  MetricComparison,
} from "@/lib/reports/types";

interface ProjectKpisProps {
  progress: ProgressMetric;
  coverage: CoverageMetric;
  snapshotAtEnd?: ProjectSnapshotMetrics;
  flow?: ProjectFlowMetrics;
  comparison?: MetricComparison | null;
  wipCount: number;
  blockedCount: number;
  overdueCount: number;
  overSlaCount: number;
  isVersionScope?: boolean;
  activeFilter?: string | null;
  onFilterChange?: (filter: string | null) => void;
  onViewInTasks?: (filterKey: string) => void;
}

export function ProjectKpis({
  progress,
  coverage,
  snapshotAtEnd,
  flow,
  comparison,
  wipCount,
  blockedCount,
  overdueCount,
  overSlaCount,
  isVersionScope = false,
  activeFilter,
  onFilterChange,
  onViewInTasks,
}: ProjectKpisProps) {
  const unitLabel =
    progress.unit === "points"
      ? "story points"
      : progress.unit === "estimate"
        ? "giờ (estimate)"
        : "task";

  const completionPercentage = snapshotAtEnd?.completionRatio ?? progress.percentage;
  const doneCount = snapshotAtEnd?.doneAtEnd ?? progress.done;
  const totalCount = snapshotAtEnd?.totalAtEnd ?? progress.total;

  const cards = [
    {
      id: "completion",
      label: isVersionScope ? "Tiến độ phiên bản" : "Tiến độ trong kỳ",
      value: completionPercentage !== null ? `${completionPercentage}%` : "Chưa đủ số liệu",
      subtext: `${doneCount} / ${totalCount} ${unitLabel}`,
      icon: TrendingUp,
      color: "text-primary",
      bg: "bg-primary/10",
      filterKey: null,
      customContent: completionPercentage !== null && (
        <Progress value={completionPercentage} className="h-1.5 mt-2" />
      ),
    },
    {
      id: "throughput",
      label: "Hoàn thành trong kỳ",
      value: flow ? flow.completedInPeriod : doneCount,
      subtext: comparison
        ? `${comparison.completed.delta >= 0 ? "+" : ""}${comparison.completed.delta} so với kỳ trước`
        : "Thông lượng hoàn thành",
      icon: CheckCircle,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      filterKey: "completed",
      delta: comparison?.completed.delta,
    },
    {
      id: "created",
      label: "Tạo mới trong kỳ",
      value: flow ? flow.createdInPeriod : 0,
      subtext: comparison
        ? `${comparison.created.delta >= 0 ? "+" : ""}${comparison.created.delta} so với kỳ trước`
        : "Công việc mới phát sinh",
      icon: FolderPlus,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10",
      filterKey: "created",
      delta: comparison?.created.delta,
    },
    {
      id: "wip",
      label: "Đang xử lý (WIP)",
      value: wipCount,
      subtext: "In Progress / Review / QA",
      icon: PlayCircle,
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-500/10",
      filterKey: "wip",
    },
    {
      id: "blocked",
      label: "Bị nghẽn (Blocked)",
      value: blockedCount,
      subtext: blockedCount > 0 ? "Cần hỗ trợ tháo gỡ" : "Không có việc nghẽn",
      icon: AlertOctagon,
      color: blockedCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
      bg: blockedCount > 0 ? "bg-red-500/10" : "bg-muted",
      filterKey: "blocked",
    },
    {
      id: "overdue",
      label: "Quá hạn (Overdue)",
      value: overdueCount,
      subtext: overdueCount > 0 ? "Trễ ngày hạn chót" : "Đúng hạn dự kiến",
      icon: Clock,
      color: overdueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      bg: overdueCount > 0 ? "bg-amber-500/10" : "bg-muted",
      filterKey: "overdue",
    },
    {
      id: "over_sla",
      label: "Vượt ngưỡng SLA",
      value: overSlaCount,
      subtext: overSlaCount > 0 ? "Ở trạng thái quá lâu" : "Đảm bảo thời hạn",
      icon: ShieldAlert,
      color: overSlaCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
      bg: overSlaCount > 0 ? "bg-rose-500/10" : "bg-muted",
      filterKey: "over_sla",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {cards.map((c) => {
          const Icon = c.icon;
          const isSelected = activeFilter === c.filterKey;
          const isClickable = !!onFilterChange && c.filterKey !== null;

          return (
            <Card
              key={c.id}
              role={isClickable ? "button" : undefined}
              tabIndex={isClickable ? 0 : undefined}
              onClick={() => {
                if (!isClickable) return;
                onFilterChange(isSelected ? null : c.filterKey);
              }}
              onKeyDown={(e) => {
                if (isClickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onFilterChange(isSelected ? null : c.filterKey);
                }
              }}
              className={`transition-all duration-200 ${
                isClickable
                  ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                  : ""
              } ${isSelected ? "ring-2 ring-primary bg-muted/40 shadow-sm" : "border-border"}`}
            >
              <CardContent className="p-3.5 flex flex-col justify-between h-full">
                <div className="flex items-start justify-between gap-1 mb-2">
                  <span className="text-xs font-medium text-muted-foreground line-clamp-1">
                    {c.label}
                  </span>
                  <div className={`p-1.5 rounded-md shrink-0 ${c.bg}`}>
                    <Icon className={`h-4 w-4 ${c.color}`} aria-hidden="true" />
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold tracking-tight text-foreground">
                      {c.value}
                    </span>
                    {c.delta !== undefined && c.delta !== 0 && (
                      <span
                        className={`inline-flex items-center text-[11px] font-medium ${
                          c.delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {c.delta > 0 ? (
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                        )}
                        {Math.abs(c.delta)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={c.subtext}>
                    {c.subtext}
                  </div>
                  {c.customContent}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Active KPI drilldown action banner */}
      {activeFilter && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-primary/30 bg-primary/5 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-semibold text-foreground">
              Đang chọn xem:{" "}
              <strong className="text-primary">
                {cards.find((c) => c.filterKey === activeFilter)?.label || activeFilter}
              </strong>
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              (Bảng rủi ro bên dưới đang hiển thị kết quả lọc tương ứng)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onViewInTasks && (
              <Button
                size="sm"
                onClick={() => onViewInTasks(activeFilter)}
                className="h-8 px-3 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
              >
                <span>Xem danh sách trong tab Công việc</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onFilterChange?.(null)}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Bỏ chọn
            </Button>
          </div>
        </div>
      )}

      {/* Coverage note */}
      <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          Độ bao phủ dữ liệu: <strong>{coverage.pointsCoverage}%</strong> có Story Points,{" "}
          <strong>{coverage.estimateCoverage}%</strong> có Estimate.
        </span>
        {activeFilter && (
          <button
            type="button"
            onClick={() => onFilterChange?.(null)}
            className="text-primary hover:underline cursor-pointer"
          >
            Đang lọc: <strong>{cards.find((c) => c.filterKey === activeFilter)?.label || activeFilter}</strong> (Bấm để xóa)
          </button>
        )}
      </div>
    </div>
  );
}
