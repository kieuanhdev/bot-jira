"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bell, Cpu, Database, ListChecks, Server } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import { ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { GridSkeleton, ListSkeleton } from "@/components/shared/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Ping = { ok: boolean; ms: number; error?: string };
type Health = {
  services: Record<"db" | "jira" | "bitbucket" | "sentry" | "openai" | "ollama", Ping>;
  worker: { status: "healthy" | "degraded" | "down" | "unknown"; workerAgeMs: number | null; jiraSyncAgeMs: number | null };
  workers: Array<{
    job: string;
    lastStartedAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
  }>;
};
type Metrics = { outbox: Record<string, number> };

const SERVICE_LABEL: Record<keyof Health["services"], string> = {
  db: "Cơ sở dữ liệu",
  jira: "Jira",
  bitbucket: "Bitbucket",
  sentry: "Sentry",
  openai: "OpenAI",
  ollama: "Ollama",
};

const WORKER_STATUS: Record<Health["worker"]["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  healthy: { label: "Hoạt động tốt", tone: "success" },
  degraded: { label: "Suy giảm", tone: "warning" },
  down: { label: "Ngừng", tone: "danger" },
  unknown: { label: "Không rõ", tone: "neutral" },
};

function serviceBadge(p: Ping) {
  if (p.ok) return <Badge variant="success">{p.ms} ms</Badge>;
  if (p.error === "not configured") return <Badge variant="secondary">Chưa cấu hình</Badge>;
  return <Badge variant="danger">Lỗi</Badge>;
}

/** Hide credential-looking fragments in raw job errors. */
function maskSecrets(text: string): string {
  return text.replace(/(token|password|bearer|auth)[=:\s]+[^\s,;]+/gi, "$1=***").slice(0, 300);
}

function formatAge(ms: number | null): string {
  if (ms == null) return "chưa có";
  const min = Math.round(ms / 60_000);
  return min < 1 ? "< 1 phút" : min < 60 ? `${min} phút` : `${Math.round(min / 60)} giờ`;
}

export function AdminOverviewClient() {
  const health = useQuery({
    queryKey: [...adminKeys.overview, "health"],
    queryFn: () => api<Health>("/api/health"),
    refetchInterval: 30_000,
  });
  const metrics = useQuery({
    queryKey: [...adminKeys.overview, "metrics"],
    queryFn: () => api<Metrics>("/api/admin/metrics"),
    refetchInterval: 30_000,
  });

  const h = health.data;
  const worker = h ? WORKER_STATUS[h.worker.status] : null;
  const jobs = [...(h?.workers ?? [])].sort((a, b) => a.job.localeCompare(b.job));
  const failingJobs = jobs.filter(
    (j) => j.lastErrorAt && (!j.lastSuccessAt || j.lastErrorAt > j.lastSuccessAt)
  );
  const outbox = metrics.data?.outbox ?? {};

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={Activity}
        title="Tổng quan hệ thống"
        description="Tình trạng worker, các dịch vụ tích hợp và hàng đợi thông báo. Tự làm mới mỗi 30 giây."
      />

      {health.error ? (
        <ErrorState title="Không thể tải tình trạng hệ thống" message={getErrorMessage(health.error)} onRetry={() => health.refetch()} />
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
            value={h ? formatAge(h.worker.jiraSyncAgeMs) : "—"}
            description={<Link href="/admin/sync" className="cursor-pointer underline-offset-2 hover:underline">Quản lý đồng bộ dự án</Link>}
            icon={Database}
            tone="primary"
            loading={health.isLoading}
          />
          <MetricCard
            label="Job đang lỗi"
            value={failingJobs.length}
            description={`trên ${jobs.length} job`}
            icon={ListChecks}
            tone={failingJobs.length > 0 ? "danger" : "success"}
            loading={health.isLoading}
          />
          <MetricCard
            label="Thông báo chờ / lỗi"
            value={`${outbox.pending ?? 0} / ${outbox.failed ?? 0}`}
            description={`${outbox.sent ?? 0} đã gửi`}
            icon={Bell}
            tone={(outbox.failed ?? 0) > 0 ? "warning" : "neutral"}
            loading={metrics.isLoading}
          />
        </MetricGrid>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Dịch vụ tích hợp
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.isLoading ? (
              <ListSkeleton rows={6} />
            ) : h ? (
              <ul className="divide-y text-sm">
                {(Object.keys(SERVICE_LABEL) as Array<keyof Health["services"]>).map((k) => (
                  <li key={k} className="flex items-center justify-between gap-2 py-2">
                    <span>{SERVICE_LABEL[k]}</span>
                    <span title={h.services[k].error}>{serviceBadge(h.services[k])}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Job nền
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.isLoading ? (
              <GridSkeleton count={4} />
            ) : jobs.length === 0 ? (
              <EmptyState icon={ListChecks} title="Chưa có job nào chạy" hint="Worker sẽ ghi nhận job sau lần chạy đầu tiên." />
            ) : (
              <ul className="divide-y text-sm">
                {jobs.map((j) => {
                  const failing = failingJobs.includes(j);
                  return (
                    <li key={j.job} className="flex flex-col gap-0.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{j.job}</span>
                        {failing ? <Badge variant="danger">Lỗi</Badge> : j.lastSuccessAt ? <Badge variant="success">OK</Badge> : <Badge variant="secondary">Chưa chạy</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Thành công {j.lastSuccessAt ? timeAgo(j.lastSuccessAt) : "chưa từng"}
                        {j.lastErrorAt ? ` · lỗi ${timeAgo(j.lastErrorAt)}` : ""}
                      </span>
                      {failing && j.lastError && (
                        <span className="line-clamp-2 text-xs text-destructive" title={maskSecrets(j.lastError)}>
                          {maskSecrets(j.lastError)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
