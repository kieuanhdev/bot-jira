"use client";

import { TrendingUp, ListFilter, Clock, CheckCircle2 } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { timeAgo } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface BoardSummaryCardsProps {
  summary: { open: number; inProgress: number; stale: number; done: number };
  loading: boolean;
}

/**
 * Summary tiles using the shared MetricCard/MetricGrid component for the board summary row.
 * Tones map to semantic tokens: open=info, in-progress=primary, stale=warning, done=success.
 */
export function BoardSummaryCards({ summary, loading }: BoardSummaryCardsProps) {
  return (
    <MetricGrid columns={4} className="mb-4 gap-3">
      <MetricCard
        label="Mở"
        value={summary.open}
        icon={TrendingUp}
        tone="info"
        loading={loading}
      />
      <MetricCard
        label="Đang làm"
        value={summary.inProgress}
        icon={ListFilter}
        tone="primary"
        loading={loading}
      />
      <MetricCard
        label="Tồn đọng 7d+"
        value={summary.stale}
        icon={Clock}
        tone="warning"
        loading={loading}
      />
      <MetricCard
        label="Hoàn thành"
        value={summary.done}
        icon={CheckCircle2}
        tone="success"
        loading={loading}
      />
    </MetricGrid>
  );
}

export interface BoardStatsLineProps {
  summary: { open: number; inProgress: number; stale: number; done: number };
  loading: boolean;
  issueCount: number;
  lastSuccessAt: string | null | undefined;
}

/** One quiet line of board totals instead of a row of metric cards. */
export function BoardStatsLine({ summary, loading, issueCount, lastSuccessAt }: BoardStatsLineProps) {
  if (loading) return <Skeleton className="h-4 w-72" />;
  const items: Array<[string, number, string?]> = [
    ["Mở", summary.open],
    ["Đang làm", summary.inProgress],
    ["Tồn đọng 7d+", summary.stale, summary.stale > 0 ? "text-warning" : undefined],
    ["Hoàn thành", summary.done],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground tabular-nums">{issueCount}</span> task
      </span>
      {items.map(([label, value, tone]) => (
        <span key={label}>
          {label} <span className={`font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</span>
        </span>
      ))}
      {lastSuccessAt ? <span className="ml-auto">Đồng bộ {timeAgo(lastSuccessAt)}</span> : null}
    </div>
  );
}
