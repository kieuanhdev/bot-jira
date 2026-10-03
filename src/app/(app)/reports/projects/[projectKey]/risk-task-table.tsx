"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  AlertTriangle,
  Clock,
  UserX,
  ExternalLink,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { RiskTaskItem, RiskReason } from "@/lib/reports/types";
import { REPORT_STATUS_STYLE } from "@/lib/reports/status";

interface RiskTaskTableProps {
  tasks: RiskTaskItem[];
  total: number;
  limit: number;
  offset: number;
  onPageChange?: (offset: number) => void;
  filterRisk?: string | null;
  onFilterRisk?: (risk: string | null) => void;
}

const RISK_BADGES: Record<
  RiskReason,
  { label: string; variant: "danger" | "warning" | "secondary" | "info"; icon: LucideIcon }
> = {
  blocked: { label: "Bị nghẽn", variant: "danger", icon: AlertOctagon },
  overdue: { label: "Quá hạn", variant: "warning", icon: Clock },
  over_sla: { label: "Quá SLA", variant: "danger", icon: AlertTriangle },
  unassigned: { label: "Chưa phân công", variant: "secondary", icon: UserX },
};

export function RiskTaskTable({
  tasks,
  total,
  limit,
  offset,
  onPageChange,
  filterRisk,
  onFilterRisk,
}: RiskTaskTableProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-3">
      {/* Controls & risk filter buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">
            Lọc theo rủi ro:
          </span>
          <button
            type="button"
            onClick={() => onFilterRisk?.(null)}
            className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
              filterRisk === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Tất cả ({total})
          </button>
          <button
            type="button"
            onClick={() => onFilterRisk?.("blocked")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
              filterRisk === "blocked"
                ? "bg-red-600 text-white border-red-600"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <AlertOctagon className="h-3 w-3" />
            Bị nghẽn
          </button>
          <button
            type="button"
            onClick={() => onFilterRisk?.("overdue")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
              filterRisk === "overdue"
                ? "bg-amber-600 text-white border-amber-600"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Clock className="h-3 w-3" />
            Quá hạn
          </button>
          <button
            type="button"
            onClick={() => onFilterRisk?.("over_sla")}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
              filterRisk === "over_sla"
                ? "bg-rose-600 text-white border-rose-600"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            Quá SLA
          </button>
        </div>

        <div className="text-xs text-muted-foreground">
          {total > 0 ? (
            <>
              Hiển thị {offset + 1} - {Math.min(offset + limit, total)} trên tổng số {total} task
            </>
          ) : (
            "Không có task nào"
          )}
        </div>
      </div>

      {/* Table */}
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border bg-card">
          <ShieldAlert className="h-7 w-7 text-muted-foreground mb-2" aria-hidden="true" />
          <h4 className="text-sm font-semibold">Không tìm thấy task rủi ro</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Không có task nào vi phạm tiêu chí lọc đã chọn trong phạm vi này.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-4">Task</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3">Người thực hiện</th>
                <th className="py-2.5 px-3">Loại rủi ro</th>
                <th className="py-2.5 px-3 text-right">Tuổi trạng thái</th>
                <th className="py-2.5 px-3 text-center">Hạn chót</th>
                <th className="py-2.5 px-3 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tasks.map((task) => {
                const statusStyle = REPORT_STATUS_STYLE[task.statusGroup];

                return (
                  <tr
                    key={task.jiraKey}
                    className="hover:bg-muted/30 transition-colors duration-150"
                  >
                    {/* Key & Summary */}
                    <td className="py-3 px-4 max-w-[320px]">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-primary">
                          {task.jiraKey}
                        </span>
                        <span className="text-xs text-foreground line-clamp-2 mt-0.5" title={task.summary}>
                          {task.summary}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${statusStyle?.bg || "bg-muted"} ${statusStyle?.text || "text-foreground"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusStyle?.dot || "bg-muted"}`} />
                        {task.status}
                      </span>
                    </td>

                    {/* Assignee */}
                    <td className="py-3 px-3 text-xs text-foreground whitespace-nowrap">
                      {task.assigneeDisplayName}
                    </td>

                    {/* Risks */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {task.risks.map((risk) => {
                          const config = RISK_BADGES[risk];
                          if (!config) return null;
                          const Icon = config.icon;
                          return (
                            <Badge
                              key={risk}
                              variant={config.variant}
                              className="gap-1 py-0.5 px-1.5 text-[10px]"
                            >
                              <Icon className="h-2.5 w-2.5" />
                              {config.label}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>

                    {/* State age */}
                    <td className="py-3 px-3 text-right font-mono text-xs text-foreground whitespace-nowrap">
                      {task.stateAgeDays} ngày lv
                    </td>

                    {/* Due Date */}
                    <td className="py-3 px-3 text-center text-xs whitespace-nowrap">
                      {task.dueDate ? (
                        <span className={task.overdueDays > 0 ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"}>
                          {task.dueDate}
                          {task.overdueDays > 0 && (
                            <span className="block text-[10px]">
                              (+{task.overdueDays}d)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/issue/${task.jiraKey}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                      >
                        Mở <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            Trang {currentPage} / {totalPages}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={offset <= 0}
              onClick={() => onPageChange?.(Math.max(0, offset - limit))}
              className="px-2.5 py-1 text-xs rounded-md border border-border bg-card text-foreground hover:bg-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={offset + limit >= total}
              onClick={() => onPageChange?.(offset + limit)}
              className="px-2.5 py-1 text-xs rounded-md border border-border bg-card text-foreground hover:bg-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
