"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  Layers,
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
import { SegmentedControl } from "@/components/shared/segmented-control";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  };
  workers: Array<{
    job: string;
    lastStartedAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
    stats?: Record<string, unknown> | null;
  }>;
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
  ai: {
    scores: number;
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

const JOB_LABELS: Record<string, string> = {
  "ai-score": "Chấm điểm AI",
  "capture-project-report-snapshots": "Chụp snapshot báo cáo",
  "check-branches": "Kiểm tra nhánh",
  "deliver-notifications": "Gửi thông báo",
  "detect-people-fields": "Dò trường người dùng",
  "health-alert": "Cảnh báo sức khỏe",
  "notify-unmerged-prs": "Nhắc PR chưa merge",
  "parse-comment-branches": "Đọc nhánh từ comment",
  "poll-pr-comments": "Lấy comment PR",
  "poll-watched-issues": "Theo dõi issue",
  "reconcile-deleted-issues": "Đối soát issue đã xoá",
  "sentry-import": "Nhập Sentry",
  "stale-detect": "Phát hiện issue đứng",
  "sync-dev-status": "Đồng bộ trạng thái dev",
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

type BarSegment = {
  label: string;
  count: number;
  color: string;
  dotColor?: string;
};

function StackedBar({
  title,
  subtitle,
  segments,
  emptyHint = "Chưa có dữ liệu",
}: {
  title: string;
  subtitle?: React.ReactNode;
  segments: BarSegment[];
  emptyHint?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex flex-col justify-between rounded-lg border border-border bg-card p-3.5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
        {total === 0 ? (
          <div className="my-3 flex h-8 items-center justify-center rounded border border-dashed border-border/70 text-xs text-muted-foreground">
            {emptyHint}
          </div>
        ) : (
          <div className="my-3 flex h-2 w-full overflow-hidden rounded-full bg-muted/60">
            {segments.map((s, idx) => {
              if (s.count <= 0) return null;
              const pct = (s.count / total) * 100;
              return (
                <div
                  key={idx}
                  title={`${s.label}: ${s.count} (${Math.round(pct)}%)`}
                  style={{ width: `${pct}%` }}
                  className={cn("h-full transition-all duration-200", s.color)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {segments.map((s, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.dotColor ?? s.color)} aria-hidden="true" />
            <span className="text-muted-foreground">{s.label}:</span>
            <span className="font-semibold tabular-nums text-foreground">{s.count.toLocaleString("vi-VN")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminOverviewClient() {
  const [jobFilter, setJobFilter] = React.useState<"all" | "failing" | "never">("all");
  const [expandedJobKeys, setExpandedJobKeys] = React.useState<Set<string>>(new Set());

  const toggleJobExpanded = (job: string) => {
    setExpandedJobKeys((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job);
      else next.add(job);
      return next;
    });
  };

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
  const worker = h ? WORKER_STATUS[h.worker.status] : null;
  const jobs = React.useMemo(() => h?.workers ?? [], [h?.workers]);

  const failingJobs = React.useMemo(
    () => jobs.filter((j) => j.lastErrorAt && (!j.lastSuccessAt || j.lastErrorAt > j.lastSuccessAt)),
    [jobs]
  );
  const neverRanJobs = React.useMemo(
    () => jobs.filter((j) => !j.lastSuccessAt && !j.lastErrorAt),
    [jobs]
  );

  const sortedJobs = React.useMemo(() => {
    const list = [...jobs];
    return list.sort((a, b) => {
      const aFailing = a.lastErrorAt && (!a.lastSuccessAt || a.lastErrorAt > a.lastSuccessAt);
      const bFailing = b.lastErrorAt && (!b.lastSuccessAt || b.lastErrorAt > b.lastSuccessAt);
      if (aFailing && !bFailing) return -1;
      if (!aFailing && bFailing) return 1;

      const aNever = !a.lastSuccessAt && !a.lastErrorAt;
      const bNever = !b.lastSuccessAt && !b.lastErrorAt;
      if (aNever && !bNever) return -1;
      if (!aNever && bNever) return 1;

      if (!a.lastSuccessAt && b.lastSuccessAt) return -1;
      if (a.lastSuccessAt && !b.lastSuccessAt) return 1;
      if (a.lastSuccessAt && b.lastSuccessAt) {
        return new Date(a.lastSuccessAt).getTime() - new Date(b.lastSuccessAt).getTime();
      }
      return a.job.localeCompare(b.job);
    });
  }, [jobs]);

  const filteredJobs = React.useMemo(() => {
    if (jobFilter === "failing") return failingJobs;
    if (jobFilter === "never") return neverRanJobs;
    return sortedJobs;
  }, [jobFilter, failingJobs, neverRanJobs, sortedJobs]);

  const outbox = metrics.data?.outbox ?? {};
  const sentry = metrics.data?.sentryImport ?? {};
  const rawReleases = metrics.data?.releasesByStatus;
  const releaseSegments: BarSegment[] = React.useMemo(() => {
    const releases = rawReleases ?? {};
    const base = [
      { label: "Bản nháp", count: releases.draft ?? 0, color: "bg-muted-foreground/40", dotColor: "bg-muted-foreground/40" },
      { label: "Đang mở", count: (releases.open ?? 0) + (releases.active ?? 0), color: "bg-sky-500", dotColor: "bg-sky-500" },
      { label: "Sẵn sàng", count: releases.ready ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
      { label: "Đã phát hành", count: releases.released ?? 0, color: "bg-teal-500", dotColor: "bg-teal-500" },
      { label: "Đã đóng", count: releases.closed ?? 0, color: "bg-slate-500", dotColor: "bg-slate-500" },
    ].filter((s) => s.count > 0);

    if (base.length > 0) return base;
    for (const [k, v] of Object.entries(releases)) {
      if (v > 0) base.push({ label: k, count: v, color: "bg-primary", dotColor: "bg-primary" });
    }
    return base;
  }, [rawReleases]);

  const rawAiDecisions = metrics.data?.ai?.decisions;
  const aiSegments: BarSegment[] = React.useMemo(() => {
    const aiDecisions = rawAiDecisions ?? {};
    const base = [
      { label: "Chấp nhận", count: aiDecisions.accepted ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
      { label: "Từ chối", count: aiDecisions.rejected ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
      { label: "Mặc định", count: (aiDecisions.fallback ?? 0) + (aiDecisions.default ?? 0), color: "bg-amber-500", dotColor: "bg-amber-500" },
    ].filter((s) => s.count > 0);

    if (base.length > 0) return base;
    for (const [k, v] of Object.entries(aiDecisions)) {
      if (v > 0) base.push({ label: k, count: v, color: "bg-primary", dotColor: "bg-primary" });
    }
    return base;
  }, [rawAiDecisions]);

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

  const systemStatus = React.useMemo(() => {
    if (!h) return null;
    const issues: Array<{ text: string; href?: string }> = [];

    if (h.worker.status === "down") {
      issues.push({ text: "Worker ngừng hoạt động" });
    } else if (h.worker.status === "degraded") {
      issues.push({ text: "Worker trạng thái suy giảm" });
    }

    if (!h.services.db.ok) {
      issues.push({ text: "Cơ sở dữ liệu mất kết nối", href: "#services" });
    }

    const failingServices = (Object.keys(h.services) as Array<keyof Health["services"]>).filter(
      (k) => !h.services[k].ok && h.services[k].error !== "not configured" && k !== "db"
    );
    if (failingServices.length > 0) {
      issues.push({
        text: `${failingServices.length} dịch vụ lỗi (${failingServices.map((k) => SERVICE_LABEL[k]).join(", ")})`,
        href: "#services",
      });
    }

    const slowServices = (Object.keys(h.services) as Array<keyof Health["services"]>).filter(
      (k) => h.services[k].ok && h.services[k].ms >= 1000
    );
    if (slowServices.length > 0) {
      issues.push({
        text: slowServices.map((k) => `${SERVICE_LABEL[k]} chậm (${h.services[k].ms} ms)`).join(", "),
        href: "#services",
      });
    }

    if (failingJobs.length > 0) {
      issues.push({
        text: `${failingJobs.length} job nền gặp lỗi`,
        href: "#jobs",
      });
    }

    if ((outbox.failed ?? 0) > 0) {
      issues.push({
        text: `${outbox.failed} thông báo gửi lỗi`,
        href: "#queues",
      });
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
  }, [h, failingJobs.length, outbox.failed, jobs.length]);

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
                {systemStatus.issues.slice(0, 3).map((issue, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1">
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    {issue.href ? (
                      <a href={issue.href} className="cursor-pointer font-medium underline-offset-2 hover:underline">
                        {issue.text}
                      </a>
                    ) : (
                      <span>{issue.text}</span>
                    )}
                  </span>
                ))}
                {systemStatus.issues.length > 3 && (
                  <span className="text-muted-foreground">+{systemStatus.issues.length - 3} vấn đề khác</span>
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
            description={`trên ${jobs.length} job`}
            icon={ListChecks}
            tone={failingJobs.length > 0 ? "danger" : "success"}
            loading={health.isLoading}
            onClick={() => setJobFilter((prev) => (prev === "failing" ? "all" : "failing"))}
            selected={jobFilter === "failing"}
          />
          <MetricCard
            label="Thông báo lỗi"
            value={outbox.failed ?? 0}
            description={`${outbox.pending ?? 0} chờ · ${outbox.sent ?? 0} đã gửi`}
            icon={Bell}
            tone={(outbox.failed ?? 0) > 0 ? "danger" : "neutral"}
            loading={metrics.isLoading}
            onClick={() => {
              const el = document.getElementById("queues");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
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
                        <p className="pl-4 text-xs text-destructive">
                          {maskSecrets(ping.error)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        {/* Jobs Card */}
        <Card className="lg:col-span-2" id="jobs">
          <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Job nền
            </CardTitle>
            <SegmentedControl
              items={[
                { value: "all", label: "Tất cả", count: jobs.length },
                { value: "failing", label: "Lỗi", count: failingJobs.length },
                { value: "never", label: "Chưa chạy", count: neverRanJobs.length },
              ]}
              value={jobFilter}
              onChange={setJobFilter}
              aria-label="Lọc danh sách job"
            />
          </CardHeader>
          <CardContent>
            {health.isLoading ? (
              <ListSkeleton rows={6} />
            ) : jobs.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Chưa có job nào chạy"
                hint="Worker sẽ ghi nhận job sau lần chạy đầu tiên."
              />
            ) : filteredJobs.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title={jobFilter === "failing" ? "Không có job nào lỗi" : "Không có job phù hợp"}
                hint={jobFilter === "failing" ? "Tất cả các job đang chạy ổn định." : "Thử đổi bộ lọc sang tất cả."}
              />
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job</TableHead>
                        <TableHead className="w-28">Trạng thái</TableHead>
                        <TableHead className="w-32">Thành công</TableHead>
                        <TableHead className="w-32">Lỗi gần nhất</TableHead>
                        <TableHead className="w-16 text-right">Chi tiết</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.map((j) => {
                        const failing = failingJobs.includes(j);
                        const hasDetails = Boolean(j.lastError || (j.stats && Object.keys(j.stats).length > 0));
                        const isExpanded = expandedJobKeys.has(j.job);
                        const label = JOB_LABELS[j.job] ?? j.job;

                        return (
                          <React.Fragment key={j.job}>
                            <TableRow className={cn(failing && "bg-rose-500/[0.03]")}>
                              <TableCell className="py-2.5">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{label}</span>
                                  <span className="font-mono text-xs text-muted-foreground">{j.job}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5">
                                {failing ? (
                                  <Badge variant="danger">Lỗi</Badge>
                                ) : j.lastSuccessAt ? (
                                  <Badge variant="success">OK</Badge>
                                ) : (
                                  <Badge variant="secondary">Chưa chạy</Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-muted-foreground">
                                {j.lastSuccessAt ? timeAgo(j.lastSuccessAt) : "chưa từng"}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-muted-foreground">
                                {j.lastErrorAt ? (
                                  <span className={cn(failing && "font-medium text-destructive")}>
                                    {timeAgo(j.lastErrorAt)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                {hasDetails ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 cursor-pointer p-0"
                                    onClick={() => toggleJobExpanded(j.job)}
                                    aria-expanded={isExpanded}
                                    aria-label={`Chi tiết job ${label}`}
                                  >
                                    <ChevronRight
                                      className={cn(
                                        "h-4 w-4 transition-transform duration-150 motion-reduce:transition-none",
                                        isExpanded && "rotate-90"
                                      )}
                                      aria-hidden="true"
                                    />
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                            {isExpanded && hasDetails && (
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={5} className="px-4 py-2">
                                  <div className="flex flex-col gap-2">
                                    {j.lastError && (
                                      <div>
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
                                          Thông báo lỗi gần nhất
                                        </span>
                                        <pre className="mt-1 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                                          {maskSecrets(j.lastError)}
                                        </pre>
                                      </div>
                                    )}
                                    {j.stats && Object.keys(j.stats).length > 0 && (
                                      <div>
                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                          Thống kê (stats)
                                        </span>
                                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                          {Object.entries(j.stats).map(([k, v]) => (
                                            <span key={k} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                                              {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile List View */}
                <div className="divide-y text-sm sm:hidden">
                  {filteredJobs.map((j) => {
                    const failing = failingJobs.includes(j);
                    const hasDetails = Boolean(j.lastError || (j.stats && Object.keys(j.stats).length > 0));
                    const isExpanded = expandedJobKeys.has(j.job);
                    const label = JOB_LABELS[j.job] ?? j.job;

                    return (
                      <div key={j.job} className="flex flex-col gap-1 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{label}</span>
                            <span className="font-mono text-xs text-muted-foreground">{j.job}</span>
                          </div>
                          {failing ? (
                            <Badge variant="danger">Lỗi</Badge>
                          ) : j.lastSuccessAt ? (
                            <Badge variant="success">OK</Badge>
                          ) : (
                            <Badge variant="secondary">Chưa chạy</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>Thành công: {j.lastSuccessAt ? timeAgo(j.lastSuccessAt) : "chưa từng"}</span>
                          {j.lastErrorAt && (
                            <span className={cn(failing && "font-medium text-destructive")}>
                              · Lỗi: {timeAgo(j.lastErrorAt)}
                            </span>
                          )}
                        </div>
                        {hasDetails && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => toggleJobExpanded(j.job)}
                              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                              aria-expanded={isExpanded}
                            >
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none",
                                  isExpanded && "rotate-90"
                                )}
                                aria-hidden="true"
                              />
                              <span>{isExpanded ? "Thu gọn chi tiết" : "Xem chi tiết"}</span>
                            </button>
                            {isExpanded && (
                              <div className="mt-2 flex flex-col gap-2">
                                {j.lastError && (
                                  <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                                    {maskSecrets(j.lastError)}
                                  </pre>
                                )}
                                {j.stats && Object.keys(j.stats).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 text-xs">
                                    {Object.entries(j.stats).map(([k, v]) => (
                                      <span key={k} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                                        {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hàng đợi & tích hợp (Snapshot) */}
      <Card id="queues">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Hàng đợi & tích hợp
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ảnh chụp tức thời từ hàng đợi thông báo, lỗi Sentry, phiên phát hành và AI.
          </p>
        </CardHeader>
        <CardContent>
          {metrics.isLoading ? (
            <ListSkeleton rows={4} />
          ) : metrics.error ? (
            <ErrorState
              title="Không thể tải dữ liệu hàng đợi"
              message={getErrorMessage(metrics.error)}
              onRetry={() => metrics.refetch()}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StackedBar
                title="Thông báo Outbox"
                segments={[
                  { label: "Chờ", count: outbox.pending ?? 0, color: "bg-sky-500", dotColor: "bg-sky-500" },
                  { label: "Đã gửi", count: outbox.sent ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
                  { label: "Lỗi", count: outbox.failed ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
                ]}
              />
              <StackedBar
                title="Nhập lỗi Sentry"
                segments={[
                  { label: "Chờ", count: sentry.pending ?? 0, color: "bg-sky-500", dotColor: "bg-sky-500" },
                  { label: "Đã tạo", count: sentry.created ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
                  { label: "Lỗi", count: sentry.failed ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
                  {
                    label: "Bỏ qua",
                    count: sentry.ignored ?? 0,
                    color: "bg-muted-foreground/40",
                    dotColor: "bg-muted-foreground/40",
                  },
                ]}
              />
              <StackedBar
                title="Phiên phát hành"
                segments={releaseSegments}
                emptyHint="Chưa có phiên phát hành"
              />
              <StackedBar
                title="Đánh giá AI"
                subtitle={metrics.data?.ai ? `${metrics.data.ai.scores} lượt` : undefined}
                segments={aiSegments}
                emptyHint="Chưa có đánh giá AI"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
