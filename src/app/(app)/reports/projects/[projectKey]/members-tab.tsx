"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
import { Skeleton } from "@/components/ui/skeleton";
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
  ChevronRight,
  Search,
  UserRoundX,
  type LucideIcon,
} from "lucide-react";
import { getPeriodDisplayLabel } from "@/lib/reports/period";
import type {
  ProjectMembersResponse,
  ReportPeriod,
  SupportSignal,
} from "@/lib/reports/types";
import { MemberVisibilityDialog } from "./member-visibility-dialog";
import {
  clearMemberVisibility,
  filterMembersByVisibility,
  loadMemberVisibility,
  saveMemberVisibility,
} from "./lib/member-report-preferences";

const MemberWorkloadChart = dynamic(
  () => import("./member-workload-chart").then((module) => module.MemberWorkloadChart),
  { ssr: false, loading: () => <Skeleton className="h-[520px] w-full rounded-xl" /> }
);

const MemberDetailReport = dynamic(
  () => import("./member-detail-report").then((module) => module.MemberDetailReport),
  { ssr: false, loading: () => <Skeleton className="h-[520px] w-full rounded-xl" /> }
);

interface MembersTabProps {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
  selectedMemberId?: string | null;
  onSelectMember?: (assignee: string | null) => void;
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

export function MembersTab({
  projectKey,
  period,
  versionId,
  selectedMemberId,
  onSelectMember,
  onDrillDownToTasks,
}: MembersTabProps) {
  const [internalSelectedAssignee, setInternalSelectedAssignee] = useState<string | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<"forward" | "backward">("forward");
  const [searchQuery, setSearchQuery] = useState("");
  const [memberVisibility, setMemberVisibility] = useState(() => loadMemberVisibility(projectKey));

  const effectiveSelectedAssignee =
    selectedMemberId !== undefined ? selectedMemberId : internalSelectedAssignee;

  const prevAssigneeRef = useRef(effectiveSelectedAssignee);
  useEffect(() => {
    if (prevAssigneeRef.current && !effectiveSelectedAssignee) {
      setTransitionDirection("backward");
    } else if (!prevAssigneeRef.current && effectiveSelectedAssignee) {
      setTransitionDirection("forward");
    }
    prevAssigneeRef.current = effectiveSelectedAssignee;
  }, [effectiveSelectedAssignee]);

  const isVersionScope = Boolean(versionId && versionId !== "all");
  const periodLabel = isVersionScope ? "Toàn bộ version" : getPeriodDisplayLabel(period);

  const memberParams = useMemo(() => {
    const params: Record<string, string> = { timezone: period.timezone };
    if (!isVersionScope) {
      params.period = period.preset;
      params.from = period.from;
      params.to = period.to;
    }
    if (versionId && versionId !== "all") params.versionId = versionId;
    return params;
  }, [period, isVersionScope, versionId]);

  const { data, isLoading, isError } = useQuery<ProjectMembersResponse>({
    queryKey: reportsKeys.members(projectKey, memberParams),
    queryFn: () => {
      const sp = new URLSearchParams(memberParams);
      return api<ProjectMembersResponse>(`/api/reports/projects/${projectKey}/members?${sp.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.reports.members.staleTime,
    gcTime: queryPolicy.reports.members.gcTime,
  });


  const allMembers = useMemo(() => data?.members ?? [], [data?.members]);
  const visibleMembers = useMemo(
    () => filterMembersByVisibility(allMembers, memberVisibility),
    [allMembers, memberVisibility]
  );
  // Keep direct links to an individual report usable even if that person is hidden from the team overview.
  const selectedMember = allMembers.find((member) => member.assignee === effectiveSelectedAssignee) ?? null;

  const handleSelectMember = (assignee: string) => {
    setTransitionDirection("forward");
    if (onSelectMember) {
      onSelectMember(assignee);
    } else {
      setInternalSelectedAssignee(assignee);
    }
  };

  const handleBack = () => {
    setTransitionDirection("backward");
    if (onSelectMember) {
      onSelectMember(null);
    } else {
      setInternalSelectedAssignee(null);
    }
  };

  const filteredMembers = visibleMembers.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return m.displayName.toLowerCase().includes(q) || m.assignee.toLowerCase().includes(q);
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm text-destructive border rounded-xl bg-destructive/10">
          Không thể tải dữ liệu thành viên. Vui lòng thử lại sau.
        </div>
      ) : data?.members.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
          <Users className="h-8 w-8 text-muted-foreground mb-2" />
          <h4 className="text-sm font-semibold">
            {isVersionScope ? "Chưa có thành viên nào trong version" : "Chưa có thành viên nào trong kỳ"}
          </h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Không có thành viên nào được phân công hoặc hoàn thành công việc trong phạm vi đã chọn.
          </p>
        </div>
      ) : selectedMember ? (
        /* INDIVIDUAL MEMBER VIEW WITH FORWARD TRANSITION */
        <div key={selectedMember.assignee} className="animate-view-forward">
          <MemberDetailReport
            member={selectedMember}
            periodLabel={periodLabel}
            isVersionScope={isVersionScope}
            allMembers={visibleMembers}
            onSelectMember={handleSelectMember}
            onBack={handleBack}
            onDrillDownToTasks={onDrillDownToTasks}
          />
        </div>
      ) : (
        /* TEAM MEMBER OVERVIEW WITH SMOOTH RETURN TRANSITION */
        <div
          className={`space-y-4 ${
            transitionDirection === "backward" ? "animate-view-backward" : ""
          }`}
        >
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {memberVisibility.hasSavedSelection
                  ? `Đang xem ${visibleMembers.length}/${allMembers.length} thành viên`
                  : `Đang xem tất cả ${allMembers.length} thành viên`}
              </p>
              <p className="text-xs text-muted-foreground">
                Ẩn người đã nghỉ hoặc tài khoản test khỏi báo cáo và ghi nhớ lựa chọn cho lần sau.
              </p>
            </div>
            <MemberVisibilityDialog
              members={allMembers}
              selectedAssignees={memberVisibility.assignees}
              hasSavedSelection={memberVisibility.hasSavedSelection}
              onSave={(assignees) => setMemberVisibility(saveMemberVisibility(projectKey, assignees))}
              onShowAll={() => setMemberVisibility(clearMemberVisibility(projectKey))}
            />
          </div>

          {visibleMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <UserRoundX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <h4 className="text-sm font-semibold text-foreground">Nhóm đã lưu chưa có dữ liệu trong phạm vi này</h4>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Hãy chọn lại thành viên hoặc chuyển sang “Hiển thị tất cả” để xem toàn bộ báo cáo.
              </p>
            </div>
          ) : (
            <MemberWorkloadChart
              members={visibleMembers}
              periodLabel={periodLabel}
              onSelectMember={(member) => handleSelectMember(member.assignee)}
            />
          )}

          {visibleMembers.length > 0 && <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Bảng chi tiết thành viên</h3>
                <p className="text-xs text-muted-foreground">
                  Nhấp vào dòng thành viên để xem sơ đồ phân tích chuyên sâu cá nhân.
                </p>
              </div>

              {/* Quick search input if there are multiple members */}
              {visibleMembers.length > 3 && (
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên hoặc @username..."
                    className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 px-3">Thành viên</th>
                    <th className="py-2.5 px-3 text-center">
                      {isVersionScope ? "Đã hoàn thành" : "Hoàn thành trong kỳ"}
                    </th>
                    <th className="py-2.5 px-3 text-center">Đang làm (WIP)</th>
                    <th className="py-2.5 px-3 text-center">Bị nghẽn</th>
                    <th className="py-2.5 px-3 text-center">Quá hạn / Vượt SLA</th>
                    <th className="py-2.5 px-3">Tín hiệu hỗ trợ</th>
                    <th className="py-2.5 px-3">Chi tiết tín hiệu</th>
                    <th className="py-2.5 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMembers.map((m) => {
                    const signalCfg = SIGNAL_CONFIG[m.supportSignal] || SIGNAL_CONFIG.insufficient_data;
                    const Icon = signalCfg.icon;

                    return (
                      <tr
                        key={m.assignee}
                        onClick={() => handleSelectMember(m.assignee)}
                        className="hover:bg-muted/40 cursor-pointer transition-all duration-150 group active:scale-[0.995]"
                        title={`Xem sơ đồ chi tiết cá nhân của ${m.displayName}`}
                      >
                        {/* Member */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase ring-1 ring-primary/20">
                              {m.displayName.trim().slice(0, 2)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                                {m.displayName}
                                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                              </span>
                              {m.assignee !== "unassigned" && (
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  @{m.assignee}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Completed in period */}
                        <td className="py-3 px-3 text-center">
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
                        <td className="py-3 px-3 text-center font-medium">
                          <span className={m.currentWip >= 4 ? "text-amber-600 font-bold" : ""}>
                            {m.currentWip}
                          </span>
                        </td>

                        {/* Blocked */}
                        <td className="py-3 px-3 text-center">
                          {m.currentBlocked > 0 ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
                              {m.currentBlocked}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[11px]">0</span>
                          )}
                        </td>

                        {/* Overdue / Over SLA */}
                        <td className="py-3 px-3 text-center">
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
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${signalCfg.bg}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {signalCfg.label}
                          </span>
                        </td>

                        {/* Reasons */}
                        <td className="py-3 px-3 text-muted-foreground max-w-xs">
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

                        {/* Actions */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
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
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>}
        </div>
      )}
    </div>
  );
}
