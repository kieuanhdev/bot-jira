"use client";

import { Bell, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";

function PulseDot({ className }: { className?: string }) {
  return (
    <span className={cn("block h-2.5 w-2.5 animate-pulse rounded-full bg-current", className)} />
  );
}

interface NotificationsSummaryCardsProps {
  total: number;
  unread: number;
  read: number;
  attention: number;
  tab: "all" | "unread" | "read";
  severityFilter: "all" | "attention" | "info";
  onSelectTab: (tab: "all" | "unread" | "read") => void;
  onToggleAttention: () => void;
}

/**
 * Domain wrapper over the shared MetricGrid/MetricCard for the notifications
 * summary. The "unread" card uses a pulse dot instead of a standard icon; the
 * rest map directly to semantic tones.
 */
export function NotificationsSummaryCards({
  total,
  unread,
  read,
  attention,
  tab,
  severityFilter,
  onSelectTab,
  onToggleAttention,
}: NotificationsSummaryCardsProps) {
  return (
    <MetricGrid columns={4}>
      <MetricCard
        label="Tổng thông báo"
        value={total}
        icon={Bell}
        tone="neutral"
        selected={tab === "all" && severityFilter === "all"}
        onClick={() => onSelectTab("all")}
      />
      <MetricCard
        label="Chưa đọc"
        value={unread}
        icon={PulseDot}
        tone="primary"
        selected={tab === "unread"}
        onClick={() => onSelectTab("unread")}
      />
      <MetricCard
        label="Đã xem"
        value={read}
        icon={CheckCircle2}
        tone="neutral"
        selected={tab === "read"}
        onClick={() => onSelectTab("read")}
      />
      <MetricCard
        label="Cần chú ý"
        value={attention}
        icon={AlertTriangle}
        tone="warning"
        selected={severityFilter === "attention"}
        onClick={onToggleAttention}
      />
    </MetricGrid>
  );
}
