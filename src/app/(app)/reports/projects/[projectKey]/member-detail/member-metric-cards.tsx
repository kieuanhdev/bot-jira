"use client";

import { ArrowUpRight, ArrowDownRight, CheckCircle2, CircleDot, ClockAlert, Flame } from "lucide-react";
import type { MemberReportItem } from "@/lib/reports/types";
import type { IndividualMemberAnalysis } from "../lib/member-workload-model";

interface MemberMetricCardsProps {
  member: MemberReportItem;
  analysis: IndividualMemberAnalysis;
  isVersionScope: boolean;
  drillDown: (activity?: string) => void;
}

export function MemberMetricCards({
  member,
  analysis,
  isVersionScope,
  drillDown,
}: MemberMetricCardsProps) {
  return (
  <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
    {/* Metric 1: Total assigned tasks */}
    <div
      onClick={() => drillDown()}
      className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-primary/40 hover:bg-muted/30 hover:-translate-y-0.5"
      title={`Xem tất cả việc của ${member.displayName}`}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Tổng công việc</span>
        <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
        {analysis.totalTasks}{" "}
        <span className="text-xs font-normal text-muted-foreground">task</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Tiến độ hoàn thành</span>
        <span className="font-semibold text-foreground">{analysis.completionRate}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${analysis.completionRate}%` }}
        />
      </div>
    </div>

    {/* Metric 2: Completed tasks */}
    <div
      onClick={() => drillDown("completed")}
      className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-emerald-500/40 hover:bg-muted/30 hover:-translate-y-0.5"
      title={`Xem việc hoàn thành của ${member.displayName}`}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{isVersionScope ? "Đã hoàn thành" : "Hoàn thành trong kỳ"}</span>
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {member.completedTasks}
        </span>
        <span className="text-xs font-normal text-muted-foreground">task</span>
        {member.deltaCompletedTasks !== null && member.deltaCompletedTasks !== undefined && (
          <span
            className={`inline-flex items-center text-xs font-medium ${
              member.deltaCompletedTasks >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400"
            }`}
            title="Thay đổi so với kỳ trước"
          >
            {member.deltaCompletedTasks >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(member.deltaCompletedTasks)}
          </span>
        )}
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>Nỗ lực ghi nhận</span>
        <span className="font-medium text-foreground">
          {member.completedPoints} pts · {analysis.effortSummary.completedHours}h
        </span>
      </div>
    </div>

    {/* Metric 3: In Progress (WIP) */}
    <div
      onClick={() => drillDown("current_open")}
      className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-amber-500/40 hover:bg-muted/30 hover:-translate-y-0.5"
      title={`Xem việc đang làm của ${member.displayName}`}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Đang làm (WIP)</span>
        <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-2xl font-bold tabular-nums text-foreground">
          {member.currentWip}{" "}
          <span className="text-xs font-normal text-muted-foreground">task</span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            member.currentWip <= 3
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : member.currentWip <= 4
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-red-500/15 text-red-600 dark:text-red-400"
          }`}
        >
          {member.currentWip <= 3 ? "Tối ưu" : member.currentWip <= 4 ? "Tải cao" : "Quá tải"}
        </span>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>Tỷ trọng tải</span>
        <span className="font-medium text-foreground">
          {analysis.composition.find((c) => c.key === "wip")?.percentage || 0}% tổng việc
        </span>
      </div>
    </div>

    {/* Metric 4: Blocked & Overdue Risks */}
    <div
      onClick={() => drillDown(member.currentBlocked > 0 ? "blocked" : "overdue")}
      className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-destructive/40 hover:bg-muted/30 hover:-translate-y-0.5"
      title={`Xem việc rủi ro của ${member.displayName}`}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Tắc nghẽn & Quá hạn</span>
        <ClockAlert
          className={`h-4 w-4 ${
            member.currentBlocked > 0 || member.currentOverdue > 0
              ? "text-destructive"
              : "text-muted-foreground"
          }`}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={`text-2xl font-bold tabular-nums ${
            member.currentBlocked > 0 || member.currentOverdue > 0
              ? "text-destructive"
              : "text-foreground"
          }`}
        >
          {member.currentBlocked + member.currentOverdue}
        </span>
        <span className="text-xs font-normal text-muted-foreground">task rủi ro</span>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>Chi tiết rủi ro</span>
        <span className="font-medium text-foreground">
          {member.currentBlocked > 0 ? `${member.currentBlocked} nghẽn` : "0 nghẽn"} ·{" "}
          {member.currentOverdue > 0 ? `${member.currentOverdue} trễ` : "0 trễ"}
        </span>
      </div>
    </div>
  </div>
  );
}
