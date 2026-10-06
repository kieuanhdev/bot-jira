import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReportStatusGroup } from "@/lib/reports/types";
import { formatHours, type DistributionTotals, type EnrichedStatusItem } from "./model";

/** Detailed per-status table with totals footer. */
export function StatusTableView({
  enrichedItems,
  statusCount,
  totals,
  unitLabel,
  selectedGroup,
  showSecondaryMetrics,
  onGroupClick,
}: {
  enrichedItems: EnrichedStatusItem[];
  statusCount: number;
  totals: DistributionTotals;
  unitLabel: string;
  selectedGroup?: ReportStatusGroup | null;
  showSecondaryMetrics: boolean;
  onGroupClick: (group: ReportStatusGroup) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/50 font-semibold text-muted-foreground">
            <th className="py-2.5 px-3">Trạng thái Jira</th>
            <th className="py-2.5 px-3 text-right">Số lượng task</th>
            {showSecondaryMetrics && (
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
                {showSecondaryMetrics && (
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
                    onClick={() => onGroupClick(item.group)}
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
            <td className="py-2.5 px-3">Tổng cộng ({statusCount} trạng thái)</td>
            <td className="py-2.5 px-3 text-right tabular-nums">
              {totals.taskCount} task
            </td>
            {showSecondaryMetrics && (
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
  );
}
