"use client";

import Link from "next/link";
import { CheckCircle2, FolderPlus, PlayCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getJiraIssueUrl } from "@/lib/jira/urls";
import type { TaskExplorerItem } from "@/lib/reports/types";

export interface ReportTasksTableProps {
  tasks: TaskExplorerItem[];
  isVersionScope: boolean;
  jiraBaseUrl?: string;
}

export function ReportTasksTable({
  tasks,
  isVersionScope,
  jiraBaseUrl,
}: ReportTasksTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="py-2.5 px-3">Mã task</th>
            <th className="py-2.5 px-3">Tiêu đề</th>
            <th className="py-2.5 px-3">
              {isVersionScope ? "Hoạt động trong version" : "Hoạt động trong kỳ"}
            </th>
            <th className="py-2.5 px-3">Trạng thái</th>
            <th className="py-2.5 px-3">Người làm</th>
            <th className="py-2.5 px-3 text-center">Story Point</th>
            <th className="py-2.5 px-3">Rủi ro / Cảnh báo</th>
            <th className="py-2.5 px-3">Hạn chót</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.map((task) => {
            return (
              <tr key={task.jiraKey} className="hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-3 font-mono font-medium">
                  <div className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/issue/${task.jiraKey}`}
                      className="text-primary hover:underline cursor-pointer"
                      title="Xem chi tiết trong hệ thống"
                    >
                      {task.jiraKey}
                    </Link>
                    {jiraBaseUrl && (
                      <a
                        href={getJiraIssueUrl(jiraBaseUrl, task.jiraKey) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 transition-opacity"
                        title="Mở trên Jira"
                        aria-label={`Mở task ${task.jiraKey} trên Jira`}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </td>

                <td
                  className="py-2.5 px-3 font-medium text-foreground max-w-xs truncate"
                  title={task.summary}
                >
                  {task.summary}
                </td>

                <td className="py-2.5 px-3">
                  {task.activity === "completed" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      {isVersionScope ? "Đã hoàn thành" : "Hoàn thành trong kỳ"}
                    </span>
                  ) : task.activity === "created" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <FolderPlus className="h-3 w-3" aria-hidden="true" />
                      {isVersionScope ? "Thuộc version" : "Tạo mới trong kỳ"}
                    </span>
                  ) : task.activity === "current_open" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400">
                      <PlayCircle className="h-3 w-3" aria-hidden="true" /> Đang mở
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                      Không đổi
                    </span>
                  )}
                </td>

                <td className="py-2.5 px-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-muted font-medium">
                    {task.status}
                  </span>
                </td>

                <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">
                  {task.assigneeDisplayName || "Chưa phân công"}
                </td>

                <td className="py-2.5 px-3 text-center font-medium">
                  {task.points !== null ? task.points : "-"}
                </td>

                <td className="py-2.5 px-3">
                  <div className="flex flex-wrap gap-1">
                    {task.risks.length === 0 ? (
                      <span className="text-muted-foreground text-[11px]">Bình thường</span>
                    ) : (
                      task.risks.map((r: string) => (
                        <Badge
                          key={r}
                          variant={r === "blocked" ? "danger" : "warning"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {r === "blocked"
                            ? "Tắc nghẽn"
                            : r === "overdue"
                            ? "Quá hạn"
                            : r === "over_sla"
                            ? "Vượt SLA"
                            : "Chưa nhận"}
                        </Badge>
                      ))
                    )}
                  </div>
                </td>

                <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                  {task.dueDate || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
