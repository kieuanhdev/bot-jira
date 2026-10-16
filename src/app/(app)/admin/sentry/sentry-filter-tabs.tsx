"use client";

import { AlertTriangle, CheckCircle2, Clock, Inbox, XCircle } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import type { RowState, SentryFilter } from "./sentry-row";

export interface SentryFilterTabsProps {
  filter: SentryFilter;
  onChange: (filter: SentryFilter) => void;
  counts: Partial<Record<RowState, number>>;
  isLoading?: boolean;
}

export function SentryFilterTabs({
  filter,
  onChange,
  counts,
  isLoading = false,
}: SentryFilterTabsProps) {
  return (
    <MetricGrid columns={5}>
      <MetricCard
        label="Chờ duyệt"
        value={counts.review ?? 0}
        icon={Inbox}
        tone="warning"
        loading={isLoading}
        onClick={() => onChange("review")}
        selected={filter === "review"}
      />
      <MetricCard
        label="Đang tạo"
        value={counts.approved ?? 0}
        icon={Clock}
        tone="info"
        loading={isLoading}
        onClick={() => onChange("approved")}
        selected={filter === "approved"}
      />
      <MetricCard
        label="Đã tạo task"
        value={counts.created ?? 0}
        icon={CheckCircle2}
        tone="success"
        loading={isLoading}
        onClick={() => onChange("created")}
        selected={filter === "created"}
      />
      <MetricCard
        label="Đã bỏ qua"
        value={counts.rejected ?? 0}
        icon={XCircle}
        loading={isLoading}
        onClick={() => onChange("rejected")}
        selected={filter === "rejected"}
      />
      <MetricCard
        label="Lỗi"
        value={(counts.failed ?? 0) + (counts.ignored ?? 0)}
        icon={AlertTriangle}
        tone="danger"
        loading={isLoading}
        onClick={() => onChange("problem")}
        selected={filter === "problem"}
      />
    </MetricGrid>
  );
}
