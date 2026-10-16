"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/async-state";
import { Button } from "@/components/ui/button";

import { JobsCard, type ExtendedJobState } from "./overview/jobs-card";
import { QueuesCard } from "./overview/queues-card";
import { WebhooksCard, type WebhookSourceMetric } from "./overview/webhooks-card";
import { PgBossCard, type QueueMetric } from "./overview/pg-boss-card";
import { AuditCard } from "./overview/audit-card";
import { StaleIndicator } from "./overview/stale-indicator";
import { SystemStatusBanner, type SystemStatusData } from "./overview/system-status-banner";
import { MetricCardsRow } from "./overview/metric-cards-row";
import { ServicesCard, SERVICE_LABEL, type Ping, type ServiceKey } from "./overview/services-card";

const ErrorSheet = dynamic(
  () => import("./overview/error-sheet").then((m) => m.ErrorSheet),
  { ssr: false }
);

export type Health = {
  status: string;
  services: Record<ServiceKey, Ping>;
  worker: {
    status: "healthy" | "degraded" | "down" | "unknown";
    workerAgeMs: number | null;
    jiraSyncAgeMs: number | null;
    jiraFresh?: boolean;
    hasErrors?: boolean;
    staleProjects?: string[];
    failingProjects?: string[];
    jiraSyncPaused?: boolean;
    failingJobs?: string[];
    runningJobs?: string[];
    stuckJobs?: string[];
  };
  workers: ExtendedJobState[];
  schedules?: Record<string, { cron: string; label: string }>;
};

export type AdminMetrics = {
  generatedAt: string;
  worker: {
    status: "healthy" | "degraded" | "down" | "unknown";
    jiraFresh: boolean;
    jiraSyncAgeMs: number | null;
    workerAgeMs: number | null;
  };
  outbox: Record<string, number>;
  sentryImport: Record<string, number>;
  releasesByStatus: Record<string, number>;
  gatesByState: Record<string, Record<string, number>>;
  bulkOps?: Record<string, number>;
  webhooks?: Record<string, WebhookSourceMetric>;
  queues?: QueueMetric[] | null;
  ai: {
    scores: number;
    fallbackScores?: number;
    realScores?: number;
    decisions: Record<string, number>;
    defaultPoint: number;
    pointScale: number[];
  };
};

const WORKER_STATUS: Record<
  Health["worker"]["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  healthy: { label: "Hoạt động tốt", tone: "success" },
  degraded: { label: "Suy giảm", tone: "warning" },
  down: { label: "Ngừng", tone: "danger" },
  unknown: { label: "Không rõ", tone: "neutral" },
};

export function AdminOverviewClient() {
  const [errorSheetType, setErrorSheetType] = useState<"sentry" | "outbox" | null>(null);

  const health = useQuery({
    queryKey: adminKeys.health,
    queryFn: () => api<Health>("/api/health"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const metrics = useQuery({
    queryKey: adminKeys.metrics,
    queryFn: () => api<AdminMetrics>("/api/admin/metrics"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const h = health.data;
  const m = metrics.data;
  const worker = h ? WORKER_STATUS[h.worker.status] : null;
  const jobs = useMemo(() => h?.workers ?? [], [h?.workers]);

  const failingJobs = useMemo(
    () => jobs.filter((j) => j.lastErrorAt && (!j.lastSuccessAt || j.lastErrorAt > j.lastSuccessAt)),
    [jobs]
  );

  const runningJobs = useMemo(() => h?.worker.runningJobs ?? [], [h?.worker.runningJobs]);
  const stuckJobs = useMemo(() => h?.worker.stuckJobs ?? [], [h?.worker.stuckJobs]);

  const outbox = useMemo(() => m?.outbox ?? {}, [m?.outbox]);
  const sentry = useMemo(() => m?.sentryImport ?? {}, [m?.sentryImport]);
  const webhooks = useMemo(() => m?.webhooks ?? {}, [m?.webhooks]);
  const pgBossQueues = m?.queues;

  const isRefreshing = health.isFetching || metrics.isFetching;
  const lastUpdated = health.dataUpdatedAt || null;

  const handleRefresh = async () => {
    await Promise.all([health.refetch(), metrics.refetch()]);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const systemStatus: SystemStatusData | null = useMemo(() => {
    if (!h) return null;
    const issues: Array<{ text: string; sectionId?: string; href?: string }> = [];

    if (h.worker.status === "down") {
      issues.push({ text: "Worker ngừng hoạt động" });
    } else if (h.worker.status === "degraded") {
      issues.push({ text: "Worker trạng thái suy giảm" });
    }

    if (stuckJobs.length > 0) {
      issues.push({
        text: `${stuckJobs.length} job bị treo`,
        sectionId: "jobs",
      });
    }

    if (!h.services.db.ok) {
      issues.push({ text: "Cơ sở dữ liệu mất kết nối", sectionId: "services" });
    }

    const failingServices = (Object.keys(h.services) as ServiceKey[]).filter(
      (k) => !h.services[k].ok && h.services[k].error !== "not configured" && k !== "db"
    );
    if (failingServices.length > 0) {
      issues.push({
        text: `${failingServices.length} dịch vụ lỗi (${failingServices.map((k) => SERVICE_LABEL[k]).join(", ")})`,
        sectionId: "services",
      });
    }

    const slowServices = (Object.keys(h.services) as ServiceKey[]).filter(
      (k) => h.services[k].ok && h.services[k].ms >= 1000
    );
    if (slowServices.length > 0) {
      issues.push({
        text: slowServices.map((k) => `${SERVICE_LABEL[k]} chậm (${h.services[k].ms} ms)`).join(", "),
        sectionId: "services",
      });
    }

    if (failingJobs.length > 0) {
      issues.push({
        text: `${failingJobs.length} job nền gặp lỗi`,
        sectionId: "jobs",
      });
    }

    if ((outbox.failed ?? 0) > 0) {
      issues.push({
        text: `${outbox.failed} thông báo gửi lỗi`,
        sectionId: "queues",
      });
    }

    const webhookErrorCount = Object.values(webhooks).reduce((sum, w) => sum + w.errors24h, 0);
    if (webhookErrorCount > 0) {
      issues.push({
        text: `${webhookErrorCount} webhook lỗi (24h)`,
        sectionId: "webhooks",
      });
    }

    if (pgBossQueues) {
      const overloaded = pgBossQueues.find((q) => q.readyCount > 50);
      if (overloaded) {
        issues.push({
          text: `Hàng đợi ${overloaded.name} tồn đọng (${overloaded.readyCount} job)`,
          sectionId: "pg-boss-queues",
        });
      }
    }

    if (m?.gatesByState) {
      let gateFailures = 0;
      for (const st of Object.values(m.gatesByState)) {
        if ((st.failed ?? 0) > 0) gateFailures += st.failed;
      }
      if (gateFailures > 0) {
        issues.push({
          text: `${gateFailures} lượt kiểm tra release thất bại`,
          sectionId: "queues",
        });
      }
    }

    if (h.worker.staleProjects && h.worker.staleProjects.length > 0) {
      issues.push({
        text: `${h.worker.staleProjects.length} dự án đồng bộ Jira chậm`,
        href: "/admin/sync",
      });
    }

    const isDanger = h.worker.status === "down" || !h.services.db.ok;
    const isWarning = !isDanger && issues.length > 0;
    const tone: "destructive" | "warning" | "success" = isDanger ? "destructive" : isWarning ? "warning" : "success";

    const configuredServicesCount = (Object.keys(h.services) as ServiceKey[]).filter(
      (k) => h.services[k].error !== "not configured"
    ).length;
    const okServicesCount = (Object.keys(h.services) as ServiceKey[]).filter(
      (k) => h.services[k].ok
    ).length;
    const okJobsCount = jobs.length - failingJobs.length;

    return {
      tone,
      issues,
      summaryOk: `Hệ thống hoạt động bình thường — ${okServicesCount}/${configuredServicesCount} dịch vụ OK · ${okJobsCount}/${jobs.length} job OK`,
    };
  }, [h, m, failingJobs.length, outbox.failed, jobs.length, stuckJobs.length, webhooks, pgBossQueues]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Activity}
        title="Tổng quan hệ thống"
        description="Tình trạng worker, các dịch vụ tích hợp và hàng đợi thông báo."
        meta={lastUpdated ? <StaleIndicator lastUpdated={lastUpdated} /> : undefined}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={isRefreshing}
            onClick={handleRefresh}
          >
            <RefreshCw
              className={cn("h-4 w-4", isRefreshing && "animate-spin motion-reduce:animate-none")}
              aria-hidden="true"
            />
            Làm mới
          </Button>
        }
      />

      <SystemStatusBanner status={systemStatus} onScrollToSection={scrollToSection} />

      {health.error ? (
        <ErrorState
          title="Không thể tải tình trạng hệ thống"
          message={getErrorMessage(health.error)}
          onRetry={() => health.refetch()}
        />
      ) : (
        <MetricCardsRow
          worker={worker}
          workerAgeMs={h?.worker.workerAgeMs}
          jiraSyncAgeMs={h?.worker.jiraSyncAgeMs}
          jiraSyncPaused={h?.worker.jiraSyncPaused}
          staleProjectsCount={h?.worker.staleProjects?.length ?? 0}
          failingJobsCount={failingJobs.length}
          stuckJobsCount={stuckJobs.length}
          totalJobsCount={jobs.length}
          outbox={outbox}
          isHealthLoading={health.isLoading}
          isMetricsLoading={metrics.isLoading}
          onScrollToSection={scrollToSection}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ServicesCard
          services={h?.services}
          isLoading={health.isLoading}
          error={health.error}
          onRetry={() => health.refetch()}
        />

        <JobsCard
          jobs={jobs}
          failingJobs={failingJobs}
          runningJobs={runningJobs}
          stuckJobs={stuckJobs}
          schedules={h?.schedules}
          isLoading={health.isLoading}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Webhooks & pg-boss Queues Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <WebhooksCard webhooks={webhooks} isLoading={metrics.isLoading} />
        <PgBossCard queues={pgBossQueues} isLoading={metrics.isLoading} />
      </div>

      {/* Hàng đợi & tích hợp (Snapshot) */}
      <QueuesCard
        outbox={outbox}
        sentry={sentry}
        releases={m?.releasesByStatus}
        gates={m?.gatesByState}
        bulkOps={m?.bulkOps}
        ai={m?.ai}
        isLoading={metrics.isLoading}
        error={metrics.error}
        onRetry={() => metrics.refetch()}
        onOpenErrorSheet={(type) => setErrorSheetType(type)}
      />

      {/* Audit Log Card */}
      <AuditCard />

      {/* Error Sheet for Sentry / Outbox */}
      {errorSheetType && (
        <ErrorSheet
          type={errorSheetType}
          open={errorSheetType !== null}
          onOpenChange={(open) => !open && setErrorSheetType(null)}
        />
      )}
    </div>
  );
}
