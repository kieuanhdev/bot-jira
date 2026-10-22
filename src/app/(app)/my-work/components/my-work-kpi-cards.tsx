"use client";

import { MetricCard } from "@/components/shared/metric-card";
import { CheckSquare, AlertCircle, Clock, CheckCircle2, Rocket } from "lucide-react";
import type { MyWorkSummary, TaskRoleFilter } from "@/lib/my-work/service";

interface MyWorkKpiCardsProps {
  summary?: MyWorkSummary;
  loading?: boolean;
  selectedRole?: string;
  onSelectRole?: (role: TaskRoleFilter) => void;
}

export function MyWorkKpiCards({
  summary,
  loading = false,
  selectedRole,
  onSelectRole,
}: MyWorkKpiCardsProps) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <MetricCard key={i} label="" value="" loading />
        ))}
      </div>
    );
  }

  const assignedDesc = (
    <div className="flex items-center gap-2 text-xs flex-wrap mt-0.5">
      {summary.overdueCount > 0 && (
        <span className="text-destructive font-medium flex items-center gap-1">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          {summary.overdueCount} quá hạn
        </span>
      )}
      {summary.dueTodayCount > 0 && (
        <span className="text-warning font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {summary.dueTodayCount} hôm nay
        </span>
      )}
      <span className="text-muted-foreground">{summary.inProgressCount} đang làm</span>
    </div>
  );

  const waitingDesc = (
    <span className="text-xs text-muted-foreground">
      {summary.waitingActionCount > 0
        ? "Cần bạn Code Review hoặc QA kiểm thử"
        : "Không có task nào đang chờ bạn"}
    </span>
  );

  const recentDesc = (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
      <span>Đúng hạn: <strong className="text-foreground">{summary.onTimeRate}%</strong></span>
      <span>•</span>
      <span>7 ngày qua</span>
    </div>
  );

  const releaseDesc = summary.activeRelease ? (
    <div className="text-xs text-muted-foreground mt-0.5 space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-medium text-foreground">{summary.activeRelease.version}</span>
        <span>{summary.activeRelease.doneTasks}/{summary.activeRelease.totalTasks} task</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-primary h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${summary.activeRelease.progressPercent}%` }}
        />
      </div>
    </div>
  ) : (
    <span className="text-xs text-muted-foreground">Không có đợt phát hành đang mở</span>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Nhiệm vụ được giao"
        value={summary.assignedCount}
        description={assignedDesc}
        icon={CheckSquare}
        tone={summary.overdueCount > 0 ? "danger" : "primary"}
        selected={selectedRole === "assigned"}
        onClick={() => onSelectRole?.("assigned")}
      />

      <MetricCard
        label="Cần tôi xử lý (Review/QA)"
        value={summary.waitingActionCount}
        description={waitingDesc}
        icon={AlertCircle}
        tone={summary.waitingActionCount > 0 ? "warning" : "neutral"}
        selected={selectedRole === "awaiting_review" || selectedRole === "awaiting_test"}
        onClick={() => onSelectRole?.("awaiting_review")}
      />

      <MetricCard
        label="Hoàn thành gần đây"
        value={summary.recentDoneCount}
        description={recentDesc}
        icon={CheckCircle2}
        tone="success"
      />

      <MetricCard
        label="Tiến độ Release hiện tại"
        value={summary.activeRelease ? `${summary.activeRelease.progressPercent}%` : "—"}
        description={releaseDesc}
        icon={Rocket}
        tone="info"
      />
    </div>
  );
}
