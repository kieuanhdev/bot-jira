"use client";

import { Flame, Siren, Sparkles, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { Sparkline } from "@/app/(app)/admin/overview/sparkline";
import type { SentryStats as SentryStatsData } from "@/lib/sentry/stats";
import type { SentryFilter } from "./sentry-row";

export interface SentryStatsProps {
  stats?: SentryStatsData;
  isLoading?: boolean;
  filter?: SentryFilter;
  view?: "actionable" | "noise" | "all";
  sort?: string;
  onSelectCritical?: () => void;
  onSelectHot?: () => void;
}

export function SentryStats({
  stats,
  isLoading = false,
  filter,
  view,
  sort,
  onSelectCritical,
  onSelectHot,
}: SentryStatsProps) {
  const byDay = stats?.byDay ?? [];
  const sparklineData = byDay.map((d) => ({
    value: d.count,
    label: `${d.date}: ${d.count} issue`,
  }));
  const total7Days = byDay.reduce((sum, d) => sum + d.count, 0);

  const isCriticalSelected = filter === "review" && view === "actionable" && sort !== "hot";
  const isHotSelected = sort === "hot";

  return (
    <MetricGrid columns={4}>
      <MetricCard
        label="Nghiêm trọng"
        value={stats?.criticalPending ?? 0}
        icon={Siren}
        tone="danger"
        description="Bấm để xem issue ưu tiên"
        loading={isLoading}
        onClick={onSelectCritical}
        selected={isCriticalSelected}
      />
      <MetricCard
        label="Đang tăng nóng"
        value={stats?.hotCount ?? 0}
        icon={Flame}
        tone="danger"
        description="Bấm để lọc tăng nóng"
        loading={isLoading}
        onClick={onSelectHot}
        selected={isHotSelected}
      />
      <MetricCard
        label="Mới 24h qua"
        value={stats?.new24h ?? 0}
        icon={TrendingUp}
        tone="info"
        description={
          <span className="flex items-center justify-between gap-1 pt-0.5">
            <span className="text-2xs text-muted-foreground">7 ngày: {total7Days}</span>
            <Sparkline
              data={sparklineData}
              width={68}
              height={18}
              tone="teal"
              minPoints={2}
              ariaLabel={`Xu hướng 7 ngày: tổng ${total7Days} issue mới`}
            />
          </span>
        }
        loading={isLoading}
      />
      <MetricCard
        label="Tỷ lệ nhiễu"
        value={`${Math.round((stats?.noiseRatio ?? 0) * 100)}%`}
        icon={Sparkles}
        tone="neutral"
        description="Telemetry, info, expected"
        loading={isLoading}
      />
    </MetricGrid>
  );
}
