"use client";

import Link from "next/link";
import { Bell, Cpu, Database, ListChecks } from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { formatAge } from "@/lib/format/time";

export interface MetricCardsRowProps {
  worker: { label: string; tone: "success" | "warning" | "danger" | "neutral" } | null;
  workerAgeMs?: number | null;
  jiraSyncAgeMs?: number | null;
  jiraSyncPaused?: boolean;
  staleProjectsCount?: number;
  failingJobsCount: number;
  stuckJobsCount: number;
  totalJobsCount: number;
  outbox: Record<string, number>;
  isHealthLoading?: boolean;
  isMetricsLoading?: boolean;
  onScrollToSection: (id: string) => void;
}

export function MetricCardsRow({
  worker,
  workerAgeMs,
  jiraSyncAgeMs,
  jiraSyncPaused,
  staleProjectsCount = 0,
  failingJobsCount,
  stuckJobsCount,
  totalJobsCount,
  outbox,
  isHealthLoading = false,
  isMetricsLoading = false,
  onScrollToSection,
}: MetricCardsRowProps) {
  return (
    <MetricGrid columns={4}>
      <MetricCard
        label="Worker"
        value={worker?.label ?? "—"}
        description={workerAgeMs != null ? `Heartbeat ${formatAge(workerAgeMs)} trước` : undefined}
        icon={Cpu}
        tone={worker?.tone ?? "neutral"}
        loading={isHealthLoading}
      />
      <MetricCard
        label="Đồng bộ Jira cũ nhất"
        value={jiraSyncPaused ? "Tạm dừng" : formatAge(jiraSyncAgeMs)}
        description={
          staleProjectsCount > 0 ? (
            <Link
              href="/admin/sync"
              className="cursor-pointer font-medium text-amber-600 hover:underline dark:text-amber-400"
            >
              {staleProjectsCount} dự án chậm
            </Link>
          ) : (
            <Link href="/admin/sync" className="cursor-pointer underline-offset-2 hover:underline">
              Quản lý đồng bộ dự án
            </Link>
          )
        }
        icon={Database}
        tone={staleProjectsCount > 0 ? "warning" : "primary"}
        loading={isHealthLoading}
      />
      <MetricCard
        label="Job đang lỗi"
        value={failingJobsCount}
        description={
          stuckJobsCount > 0
            ? `${stuckJobsCount} job treo · trên ${totalJobsCount} job`
            : `trên ${totalJobsCount} job`
        }
        icon={ListChecks}
        tone={failingJobsCount > 0 || stuckJobsCount > 0 ? "danger" : "success"}
        loading={isHealthLoading}
        onClick={() => onScrollToSection("jobs")}
      />
      <MetricCard
        label="Thông báo lỗi"
        value={outbox.failed ?? 0}
        description={`${outbox.pending ?? 0} chờ · ${outbox.sent ?? 0} đã gửi`}
        icon={Bell}
        tone={(outbox.failed ?? 0) > 0 ? "danger" : "neutral"}
        loading={isMetricsLoading}
        onClick={() => onScrollToSection("queues")}
      />
    </MetricGrid>
  );
}
