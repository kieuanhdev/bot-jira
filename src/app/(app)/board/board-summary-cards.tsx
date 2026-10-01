"use client";

import { TrendingUp, ListFilter, Clock, CheckCircle2 } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";

interface BoardSummaryCardsProps {
  summary: { open: number; inProgress: number; stale: number; done: number };
  loading: boolean;
}

/**
 * Domain wrapper over the shared MetricGrid/MetricCard for the board summary
 * row. The four tiles are read-only (no filter action); tones map to the
 * category semantics: open=info, in-progress=primary, stale=warning, done=success.
 */
export function BoardSummaryCards({ summary, loading }: BoardSummaryCardsProps) {
  return (
    <MetricGrid columns={4} className="gap-2">
      <MetricCard
        label="Mở"
        value={summary.open}
        icon={TrendingUp}
        tone="info"
        loading={loading}
        className="p-3"
      />
      <MetricCard
        label="Đang làm"
        value={summary.inProgress}
        icon={ListFilter}
        tone="primary"
        loading={loading}
        className="p-3"
      />
      <MetricCard
        label="Tồn đọng (7d+)"
        value={summary.stale}
        icon={Clock}
        tone="warning"
        loading={loading}
        className="p-3"
      />
      <MetricCard
        label="Hoàn thành"
        value={summary.done}
        icon={CheckCircle2}
        tone="success"
        loading={loading}
        className="p-3"
      />
    </MetricGrid>
  );
}
