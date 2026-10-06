import {
  PieChart as PieChartIcon,
  Clock,
  SlidersHorizontal,
  Table as TableIcon,
  Workflow,
  RotateCcw,
} from "lucide-react";
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
import type { ReportStatusGroup, StatusDistributionItem } from "@/lib/reports/types";
import {
  DEFAULT_PREFERENCES,
  type ChartDisplayMode,
  type ChartPreferences,
  type DistributionTotals,
  type MetricDimension,
} from "./model";

export function MetricToggle({
  metric,
  onChange,
  totals,
}: {
  metric: MetricDimension;
  onChange: (metric: MetricDimension) => void;
  totals: DistributionTotals;
}) {
  return (
    <div
      className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-xs text-muted-foreground"
      role="group"
      aria-label="Chọn đơn vị hiển thị"
    >
      <button
        type="button"
        onClick={() => onChange("count")}
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
        onClick={() => onChange("points")}
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
        onClick={() => onChange("estimate")}
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
  );
}

export function DisplayModeToggle({
  displayMode,
  onChange,
}: {
  displayMode: ChartDisplayMode;
  onChange: (mode: ChartDisplayMode) => void;
}) {
  return (
    <div
      className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-xs text-muted-foreground"
      role="group"
      aria-label="Chọn chế độ biểu đồ"
    >
      <button
        type="button"
        onClick={() => onChange("donut")}
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
        onClick={() => onChange("pipeline")}
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
        onClick={() => onChange("table")}
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
  );
}

export function DisplayOptionsMenu({
  distribution,
  preferences,
  updatePreferences,
  toggleGroupVisibility,
  onShowAll,
  onOnlyOpen,
}: {
  distribution: StatusDistributionItem[];
  preferences: ChartPreferences;
  updatePreferences: (updater: (prev: ChartPreferences) => ChartPreferences) => void;
  toggleGroupVisibility: (group: ReportStatusGroup) => void;
  onShowAll: () => void;
  onOnlyOpen: () => void;
}) {
  const activeHiddenCount = preferences.hiddenGroups.length;

  return (
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
              onClick={onShowAll}
              className="text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              Hiện hết
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={onOnlyOpen}
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
  );
}
