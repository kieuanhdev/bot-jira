"use client";

import { Trophy, CheckCircle2, TrendingUp, Crown } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import type { LeaderboardSummary } from "@/lib/leaderboard/types";

interface LeaderboardSummaryCardsProps {
  summary: LeaderboardSummary | undefined;
  loading: boolean;
}

/**
 * Domain wrapper over the shared MetricGrid/MetricCard for the team KPI row.
 * The four tiles are read-only (no filter action); the "MVP" tile carries a
 * string value (the top performer's name) plus a points sub-line, and each
 * number tile keeps its unit as a one-line description.
 */
export function LeaderboardSummaryCards({ summary, loading }: LeaderboardSummaryCardsProps) {
  const mvp = summary?.topPerformer;
  return (
    <MetricGrid columns={4}>
      <MetricCard
        label="Tổng điểm hoàn thành"
        value={summary?.totalTeamPoints ?? 0}
        description="Story Points"
        icon={Trophy}
        tone="primary"
        loading={loading}
      />
      <MetricCard
        label="Task đã chốt"
        value={summary?.totalTeamTasks ?? 0}
        description="tasks hoàn thành"
        icon={CheckCircle2}
        tone="success"
        loading={loading}
      />
      <MetricCard
        label="Điểm TB / Thành viên"
        value={summary?.averagePointsPerMember ?? 0}
        description="pts / người"
        icon={TrendingUp}
        tone="info"
        loading={loading}
      />
      <MetricCard
        label="Quán Quân (MVP)"
        value={mvp?.displayName ?? "Chưa xác định"}
        description={mvp ? `${mvp.points} points hoàn thành` : undefined}
        icon={Crown}
        tone="warning"
        loading={loading}
      />
    </MetricGrid>
  );
}
