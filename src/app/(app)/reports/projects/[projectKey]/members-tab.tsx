"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Flame,
  HelpCircle,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ProjectMembersResponse,
  MemberReportItem,
  ReportPeriod,
  SupportSignal,
} from "@/lib/reports/types";

interface MembersTabProps {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
  onDrillDownToTasks?: (filter: { assignee: string; activity?: string; memberName?: string }) => void;
}

const SIGNAL_CONFIG: Record<
  SupportSignal,
  { label: string; variant: "success" | "warning" | "danger" | "secondary"; icon: LucideIcon; bg: string }
> = {
  balanced: { label: "Cân bằng", variant: "success", icon: ShieldCheck, bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  high_load: { label: "Tải cao", variant: "warning", icon: Flame, bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  needs_unblock: { label: "Cần gỡ nghẽn", variant: "danger", icon: AlertTriangle, bg: "bg-red-500/10 text-red-600 dark:text-red-400" },
  insufficient_data: { label: "Chưa đủ dữ liệu", variant: "secondary", icon: HelpCircle, bg: "bg-muted text-muted-foreground" },
};

export function MembersTab({ projectKey, period, versionId, onDrillDownToTasks }: MembersTabProps) {
  const [selectedMember, setSelectedMember] = useState<MemberReportItem | null>(null);

  const queryParams = new URLSearchParams({
    period: period.preset,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
  });
  if (versionId && versionId !== "all") queryParams.set("versionId", versionId);

  const { data, isLoading, isError } = useQuery<ProjectMembersResponse>({
    queryKey: ["reports", "members", projectKey, queryParams.toString()],
    queryFn: () => api<ProjectMembersResponse>(`/api/reports/projects/${projectKey}/members?${queryParams.toString()}`),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      {/* Disclaimer / Cultural note */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
        <p>
          <strong>Mục đích sử dụng:</strong> Báo cáo thành viên phản ánh tải công việc thực tế và tín hiệu cần hỗ trợ nhằm giúp nhóm cân bằng khối lượng và tháo gỡ tắc nghẽn kịp thời. Dữ liệu tuyệt đối <em>không quy đổi thành điểm hiệu suất hay bảng xếp hạng cá nhân</em>.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm text-destructive border rounded-xl bg-destructive/10">
          Không thể tải dữ liệu thành viên. Vui lòng thử lại sau.
        </div>
      ) : data?.members.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
          <Users className="h-8 w-8 text-muted-foreground mb-2" />
          <h4 className="text-sm font-semibold">Chưa có thành viên nào trong kỳ</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Không có thành viên nào được phân công hoặc hoàn thành công việc trong phạm vi đã chọn.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-3">Thành viên</th>
                <th className="py-2.5 px-3 text-center">Hoàn thành trong kỳ</th>
                <th className="py-2.5 px-3 text-center">Đang làm (WIP)</th>
                <th className="py-2.5 px-3 text-center">Bị nghẽn</th>
                <th className="py-2.5 px-3 text-center">Quá hạn / Vượt SLA</th>
                <th className="py-2.5 px-3">Tín hiệu hỗ trợ</th>
                <th className="py-2.5 px-3">Chi tiết tín hiệu</th>
                <th className="py-2.5 px-3 text-right">Xem việc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.members.map((m) => {
                const signalCfg = SIGNAL_CONFIG[m.supportSignal] || SIGNAL_CONFIG.insufficient_data;
                const Icon = signalCfg.icon;

                return (
                  <tr
                    key={m.assignee}
                    className="hover:bg-muted/30 transition-colors group"
                  >
                    {/* Member */}
                    <td
                      className="py-3 px-3 cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {m.displayName}
                        </span>
                        {m.assignee !== "unassigned" && (
                          <span className="text-[11px] text-muted-foreground font-mono">
                            @{m.assignee}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Completed in period */}
                    <td
                      className="py-3 px-3 text-center cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      <div className="flex items-center justify-center gap-1 font-medium">
                        <span className="text-foreground text-sm font-bold">
                          {m.completedTasks}
                        </span>
                        <span className="text-muted-foreground text-[11px]">task</span>
                        {m.deltaCompletedTasks !== null && m.deltaCompletedTasks !== undefined && (
                          <span
                            className={`inline-flex items-center text-[10px] ml-1 ${
                              m.deltaCompletedTasks >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {m.deltaCompletedTasks >= 0 ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {Math.abs(m.deltaCompletedTasks)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* WIP */}
                    <td
                      className="py-3 px-3 text-center font-medium cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      <span className={m.currentWip >= 4 ? "text-amber-600 font-bold" : ""}>
                        {m.currentWip}
                      </span>
                    </td>

                    {/* Blocked */}
                    <td
                      className="py-3 px-3 text-center cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      {m.currentBlocked > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                          {m.currentBlocked}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">0</span>
                      )}
                    </td>

                    {/* Overdue / Over SLA */}
                    <td
                      className="py-3 px-3 text-center cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      {m.currentOverdue > 0 || m.currentOverSla > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          {m.currentOverdue > 0 && `${m.currentOverdue} quá hạn`}
                          {m.currentOverdue > 0 && m.currentOverSla > 0 && ", "}
                          {m.currentOverSla > 0 && `${m.currentOverSla} quá SLA`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">Đúng hạn</span>
                      )}
                    </td>

                    {/* Signal Badge */}
                    <td
                      className="py-3 px-3 cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${signalCfg.bg}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {signalCfg.label}
                      </span>
                    </td>

                    {/* Reasons */}
                    <td
                      className="py-3 px-3 text-muted-foreground max-w-xs cursor-pointer"
                      onClick={() => setSelectedMember(m)}
                    >
                      {m.supportReasons.length > 0 ? (
                        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                          {m.supportReasons.map((r, idx) => (
                            <li key={idx} className="line-clamp-1 truncate" title={r}>
                              {r}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Không có cảnh báo</span>
                      )}
                    </td>

                    {/* Quick drill-down action */}
                    <td className="py-3 px-3 text-right">
                      {onDrillDownToTasks && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDrillDownToTasks({
                              assignee: m.assignee,
                              memberName: m.displayName,
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-500/10 cursor-pointer transition-colors"
                          title={`Xem công việc của ${m.displayName}`}
                        >
                          <span>Xem task</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Member Details Modal with Drill-Down Actions */}
      {selectedMember && (
        <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => !open && setSelectedMember(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                Chi tiết tải công việc: {selectedMember.displayName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Tình trạng phân công công việc trong dự án {projectKey}. Nhấp vào từng chỉ số để mở danh sách task tương ứng.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                {/* Completed */}
                <button
                  type="button"
                  onClick={() => {
                    onDrillDownToTasks?.({
                      assignee: selectedMember.assignee,
                      activity: "completed",
                      memberName: selectedMember.displayName,
                    });
                    setSelectedMember(null);
                  }}
                  className="p-2.5 rounded-lg bg-muted text-left hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border group"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Hoàn thành trong kỳ</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5">
                    {selectedMember.completedTasks} task
                  </div>
                </button>

                {/* WIP */}
                <button
                  type="button"
                  onClick={() => {
                    onDrillDownToTasks?.({
                      assignee: selectedMember.assignee,
                      activity: "current_open",
                      memberName: selectedMember.displayName,
                    });
                    setSelectedMember(null);
                  }}
                  className="p-2.5 rounded-lg bg-muted text-left hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border group"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Đang xử lý (WIP)</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5">
                    {selectedMember.currentWip} task
                  </div>
                </button>

                {/* Blocked */}
                <button
                  type="button"
                  onClick={() => {
                    onDrillDownToTasks?.({
                      assignee: selectedMember.assignee,
                      activity: "blocked",
                      memberName: selectedMember.displayName,
                    });
                    setSelectedMember(null);
                  }}
                  className="p-2.5 rounded-lg bg-muted text-left hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border group"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Bị nghẽn</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-red-500" />
                  </div>
                  <div className="text-base font-bold text-red-600 dark:text-red-400 mt-0.5">
                    {selectedMember.currentBlocked} task
                  </div>
                </button>

                {/* Overdue */}
                <button
                  type="button"
                  onClick={() => {
                    onDrillDownToTasks?.({
                      assignee: selectedMember.assignee,
                      activity: "overdue",
                      memberName: selectedMember.displayName,
                    });
                    setSelectedMember(null);
                  }}
                  className="p-2.5 rounded-lg bg-muted text-left hover:bg-accent cursor-pointer transition-colors border border-transparent hover:border-border group"
                >
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Quá hạn dự kiến</span>
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-amber-500" />
                  </div>
                  <div className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {selectedMember.currentOverdue} task
                  </div>
                </button>
              </div>

              {/* Reasons */}
              <div className="p-3 rounded-lg border border-border">
                <div className="font-semibold text-foreground mb-1">Tín hiệu hỗ trợ</div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {selectedMember.supportReasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>

              {/* Full Drilldown Button */}
              {onDrillDownToTasks && (
                <Button
                  type="button"
                  onClick={() => {
                    onDrillDownToTasks({
                      assignee: selectedMember.assignee,
                      memberName: selectedMember.displayName,
                    });
                    setSelectedMember(null);
                  }}
                  className="w-full text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs mt-2"
                >
                  <span>Xem toàn bộ task của {selectedMember.displayName} trong tab Công việc</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
