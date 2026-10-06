import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReportStatusGroup } from "@/lib/reports/types";
import type { DistributionTotals, EnrichedStatusItem, StageStats } from "./model";

/** Donut chart with an interactive centerpiece and a ranked status list. */
export function StatusDonutView({
  enrichedItems,
  chartActiveItems,
  focusedItem,
  stageStats,
  totals,
  currentTotal,
  unitLabel,
  selectedGroup,
  hoveredGroup,
  showSecondaryMetrics,
  onSelectGroup,
  onHoverGroup,
  onGroupClick,
}: {
  enrichedItems: EnrichedStatusItem[];
  chartActiveItems: EnrichedStatusItem[];
  focusedItem: EnrichedStatusItem | null;
  stageStats: StageStats;
  totals: DistributionTotals;
  currentTotal: number;
  unitLabel: string;
  selectedGroup?: ReportStatusGroup | null;
  hoveredGroup: ReportStatusGroup | null;
  showSecondaryMetrics: boolean;
  onSelectGroup?: (group: ReportStatusGroup | null) => void;
  onHoverGroup: (group: ReportStatusGroup | null) => void;
  onGroupClick: (group: ReportStatusGroup) => void;
}) {
  return (
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
                    onHoverGroup(chartActiveItems[index].group);
                  }
                }}
                onMouseLeave={() => onHoverGroup(null)}
                onClick={(entry) => {
                  const group = (entry as { group?: ReportStatusGroup })?.group;
                  if (group) onGroupClick(group);
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
                  const data = payload[0].payload as EnrichedStatusItem;
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
                        {showSecondaryMetrics && (
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
            {showSecondaryMetrics
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
                onMouseEnter={() => onHoverGroup(item.group)}
                onMouseLeave={() => onHoverGroup(null)}
                onClick={() => onGroupClick(item.group)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onGroupClick(item.group);
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
                    {showSecondaryMetrics && (
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
  );
}
