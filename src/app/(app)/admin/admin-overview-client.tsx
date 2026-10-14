"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Cpu,
  Database,
  ListChecks,
  RefreshCw,
  Server,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { ErrorState } from "@/components/shared/async-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { JobsCard, type ExtendedJobState } from "./overview/jobs-card";
import { QueuesCard } from "./overview/queues-card";
import { WebhooksCard, type WebhookSourceMetric } from "./overview/webhooks-card";
import { PgBossCard, type QueueMetric } from "./overview/pg-boss-card";
import { AuditCard } from "./overview/audit-card";
import { ErrorSheet, CopyButton } from "./overview/error-sheet";

type Ping = { ok: boolean; ms: number; error?: string };

type Health = {
  status: string;
  services: Record<"db" | "jira" | "bitbucket" | "sentry" | "openai" | "ollama", Ping>;
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

type AdminMetrics = {
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

const SERVICE_LABEL: Record<keyof Health["services"], string> = {
  db: "Cơ sở dữ liệu",
  jira: "Jira",
  bitbucket: "Bitbucket",
  sentry: "Sentry",
  openai: "OpenAI",
  ollama: "Ollama",
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

function serviceBadge(p: Ping) {
  if (p.error === "not configured") return <Badge variant="secondary">Chưa cấu hình</Badge>;
  if (!p.ok) return <Badge variant="danger">Lỗi</Badge>;
  if (p.ms < 1000) return <Badge variant="success">{p.ms} ms</Badge>;
  if (p.ms <= 3000) return <Badge variant="warning">{p.ms} ms (Chậm)</Badge>;
  return <Badge variant="danger">{p.ms} ms (Rất chậm)</Badge>;
}

function serviceDotColor(p: Ping): string {
  if (p.error === "not configured") return "bg-muted-foreground/30";
  if (!p.ok) return "bg-rose-500";
  if (p.ms < 1000) return "bg-emerald-500";
  if (p.ms <= 3000) return "bg-amber-500";
  return "bg-rose-500";
}

function formatAge(ms: number | null): string {
  if (ms == null) return "chưa có";
  const min = Math.round(ms / 60_000);
  return min < 1 ? "< 1 phút" : min < 60 ? `${min} phút` : `${Math.round(min / 60)} giờ`;
}

export function AdminOverviewClient() {
  const [errorSheetType, setErrorSheetType] = React.useState<"sentry" | "outbox" | null>(null);

  const health = useQuery({
    queryKey: [...adminKeys.overview, "health"],
    queryFn: () => api<Health>("/api/health"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const metrics = useQuery({
    queryKey: [...adminKeys.overview, "metrics"],
    queryFn: () => api<AdminMetrics>("/api/admin/metrics"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const h = health.data;
  const m = metrics.data;
  const worker = h ? WORKER_STATUS[h.worker.status] : null;
  const jobs = React.useMemo(() => h?.workers ?? [], [h?.workers]);

  const failingJobs = React.useMemo(
    () => jobs.filter((j) => j.lastErrorAt && (!j.lastSuccessAt || j.lastErrorAt > j.lastSuccessAt)),
    [jobs]
  );

  const runningJobs = React.useMemo(() => h?.worker.runningJobs ?? [], [h?.worker.runningJobs]);
  const stuckJobs = React.useMemo(() => h?.worker.stuckJobs ?? [], [h?.worker.stuckJobs]);

  const outbox = React.useMemo(() => m?.outbox ?? {}, [m?.outbox]);
  const sentry = React.useMemo(() => m?.sentryImport ?? {}, [m?.sentryImport]);
  const webhooks = React.useMemo(() => m?.webhooks ?? {}, [m?.webhooks]);
  const pgBossQueues = m?.queues;

  const isRefreshing = health.isFetching || metrics.isFetching;
  const lastUpdated = health.dataUpdatedAt || null;

  const now = React.useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 15_000);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => 0
  );

  const isStale = Boolean(lastUpdated && now > 0 && now - lastUpdated > 90_000);

  const handleRefresh = async () => {
    await Promise.all([health.refetch(), metrics.refetch()]);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  };

  const systemStatus = React.useMemo(() => {
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

    const failingServices = (Object.keys(h.services) as Array<keyof Health["services"]>).filter(
      (k) => !h.services[k].ok && h.services[k].error !== "not configured" && k !== "db"
    );
    if (failingServices.length > 0) {
      issues.push({
        text: `${failingServices.length} dịch vụ lỗi (${failingServices.map((k) => SERVICE_LABEL[k]).join(", ")})`,
        sectionId: "services",
      });
    }

    const slowServices = (Object.keys(h.services) as Array<keyof Health["services"]>).filter(
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

    // Webhook errors count
    const webhookErrorCount = Object.values(webhooks).reduce((sum, w) => sum + w.errors24h, 0);
    if (webhookErrorCount > 0) {
      issues.push({
        text: `${webhookErrorCount} webhook lỗi (24h)`,
        sectionId: "webhooks",
      });
    }

    // Overloaded pg-boss queue
    if (pgBossQueues) {
      const overloaded = pgBossQueues.find((q) => q.readyCount > 50);
      if (overloaded) {
        issues.push({
          text: `Hàng đợi ${overloaded.name} tồn đọng (${overloaded.readyCount} job)`,
          sectionId: "pg-boss-queues",
        });
      }
    }

    // Release gate failures count
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

    const configuredServicesCount = (Object.keys(h.services) as Array<keyof Health["services"]>).filter(
      (k) => h.services[k].error !== "not configured"
    ).length;
    const okServicesCount = (Object.keys(h.services) as Array<keyof Health["services"]>).filter(
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
        meta={
          lastUpdated ? (
            <span className="flex items-center gap-1.5">
              <span>• Cập nhật {timeAgo(new Date(lastUpdated).toISOString())}</span>
              {isStale && (
                <Badge variant="warning" className="gap-1 text-[11px]">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  Dữ liệu cũ
                </Badge>
              )}
            </span>
          ) : undefined
        }
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

      {systemStatus && (
        <FeedbackBanner
          tone={systemStatus.tone}
          icon={systemStatus.tone === "destructive" ? XCircle : systemStatus.tone === "warning" ? AlertTriangle : CheckCircle2}
          role={systemStatus.tone === "success" ? "status" : "alert"}
        >
          {systemStatus.tone === "success" ? (
            <span className="font-medium">{systemStatus.summaryOk}</span>
          ) : (
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-semibold">{systemStatus.issues.length} vấn đề cần lưu ý:</span>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {systemStatus.issues.slice(0, 4).map((issue, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1">
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    {issue.sectionId ? (
                      <button
                        type="button"
                        onClick={() => scrollToSection(issue.sectionId!)}
                        className="cursor-pointer font-medium underline-offset-2 hover:underline"
                      >
                        {issue.text}
                      </button>
                    ) : issue.href ? (
                      <Link href={issue.href} className="cursor-pointer font-medium underline-offset-2 hover:underline">
                        {issue.text}
                      </Link>
                    ) : (
                      <span>{issue.text}</span>
                    )}
                  </span>
                ))}
                {systemStatus.issues.length > 4 && (
                  <span className="text-muted-foreground">+{systemStatus.issues.length - 4} vấn đề khác</span>
                )}
              </div>
            </div>
          )}
        </FeedbackBanner>
      )}

      {health.error ? (
        <ErrorState
          title="Không thể tải tình trạng hệ thống"
          message={getErrorMessage(health.error)}
          onRetry={() => health.refetch()}
        />
      ) : (
        <MetricGrid columns={4}>
          <MetricCard
            label="Worker"
            value={worker?.label ?? "—"}
            description={h ? `Heartbeat ${formatAge(h.worker.workerAgeMs)} trước` : undefined}
            icon={Cpu}
            tone={worker?.tone ?? "neutral"}
            loading={health.isLoading}
          />
          <MetricCard
            label="Đồng bộ Jira cũ nhất"
            value={h?.worker.jiraSyncPaused ? "Tạm dừng" : h ? formatAge(h.worker.jiraSyncAgeMs) : "—"}
            description={
              h?.worker.staleProjects && h.worker.staleProjects.length > 0 ? (
                <Link href="/admin/sync" className="cursor-pointer font-medium text-amber-600 hover:underline dark:text-amber-400">
                  {h.worker.staleProjects.length} dự án chậm
                </Link>
              ) : (
                <Link href="/admin/sync" className="cursor-pointer underline-offset-2 hover:underline">
                  Quản lý đồng bộ dự án
                </Link>
              )
            }
            icon={Database}
            tone={h?.worker.staleProjects && h.worker.staleProjects.length > 0 ? "warning" : "primary"}
            loading={health.isLoading}
          />
          <MetricCard
            label="Job đang lỗi"
            value={failingJobs.length}
            description={stuckJobs.length > 0 ? `${stuckJobs.length} job treo · trên ${jobs.length} job` : `trên ${jobs.length} job`}
            icon={ListChecks}
            tone={failingJobs.length > 0 || stuckJobs.length > 0 ? "danger" : "success"}
            loading={health.isLoading}
            onClick={() => scrollToSection("jobs")}
          />
          <MetricCard
            label="Thông báo lỗi"
            value={outbox.failed ?? 0}
            description={`${outbox.pending ?? 0} chờ · ${outbox.sent ?? 0} đã gửi`}
            icon={Bell}
            tone={(outbox.failed ?? 0) > 0 ? "danger" : "neutral"}
            loading={metrics.isLoading}
            onClick={() => scrollToSection("queues")}
          />
        </MetricGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Services Card */}
        <Card id="services">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Dịch vụ tích hợp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.isLoading ? (
              <ListSkeleton rows={6} />
            ) : health.error ? (
              <ErrorState
                title="Không thể tải tình trạng dịch vụ"
                message={getErrorMessage(health.error)}
                onRetry={() => health.refetch()}
              />
            ) : h ? (
              <ul className="divide-y text-sm">
                {(Object.keys(SERVICE_LABEL) as Array<keyof Health["services"]>).map((k) => {
                  const ping = h.services[k];
                  const hasInlineError = !ping.ok && ping.error && ping.error !== "not configured";

                  return (
                    <li key={k} className="flex flex-col gap-1 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn("h-2 w-2 rounded-full", serviceDotColor(ping))}
                            aria-hidden="true"
                          />
                          <span className={cn(ping.error === "not configured" && "text-muted-foreground")}>
                            {SERVICE_LABEL[k]}
                          </span>
                        </div>
                        {serviceBadge(ping)}
                      </div>
                      {hasInlineError && (
                        <div className="mt-1 flex items-start justify-between gap-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                          <p className="font-mono text-[11px] leading-relaxed">
                            {maskSecrets(ping.error)}
                          </p>
                          <CopyButton text={maskSecrets(ping.error)} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {/* Jobs Card */}
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
