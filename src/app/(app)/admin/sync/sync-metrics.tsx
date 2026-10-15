"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FolderSync,
  PauseCircle,
  SlidersHorizontal,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";

export type SyncFilterState = "all" | "enabled" | "disabled" | "failed" | "custom";

export interface SyncMetricsProps {
  counts: {
    total: number;
    enabled: number;
    disabled: number;
    failed: number;
    custom: number;
  };
  isLoading: boolean;
  filterState: SyncFilterState;
  onFilterChange: (filter: SyncFilterState) => void;
}

export function SyncMetrics({
  counts,
  isLoading,
  filterState,
  onFilterChange,
}: SyncMetricsProps) {
  return (
    <MetricGrid columns={5}>
      <MetricCard
        label="Dự án"
        value={counts.total}
        icon={FolderSync}
        loading={isLoading}
        onClick={() => onFilterChange("all")}
        selected={filterState === "all"}
      />
      <MetricCard
        label="Đang bật"
        value={counts.enabled}
        icon={CheckCircle2}
        tone="success"
        loading={isLoading}
        onClick={() => onFilterChange(filterState === "enabled" ? "all" : "enabled")}
        selected={filterState === "enabled"}
      />
      <MetricCard
        label="Đã tắt"
        value={counts.disabled}
        icon={PauseCircle}
        tone="warning"
        loading={isLoading}
        onClick={() => onFilterChange(filterState === "disabled" ? "all" : "disabled")}
        selected={filterState === "disabled"}
      />
      <MetricCard
        label="Đang lỗi"
        value={counts.failed}
        icon={AlertTriangle}
        tone="danger"
        loading={isLoading}
        onClick={() => onFilterChange(filterState === "failed" ? "all" : "failed")}
        selected={filterState === "failed"}
      />
      <MetricCard
        label="Tuỳ chỉnh"
        value={counts.custom}
        icon={SlidersHorizontal}
        loading={isLoading}
        onClick={() => onFilterChange(filterState === "custom" ? "all" : "custom")}
        selected={filterState === "custom"}
      />
    </MetricGrid>
  );
}
