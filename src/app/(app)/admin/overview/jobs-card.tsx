"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ListChecks,
  Play,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo } from "@/lib/utils";
import { CopyButton } from "./error-sheet";
import { formatDuration, parseStats } from "./format-stats";
import { Sparkline } from "./sparkline";

export type ExtendedJobState = {
  job: string;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  stats?: Record<string, unknown> | null;
  durationMs?: number | null;
  finishedAt?: string | null;
  isRunning?: boolean;
  isStuck?: boolean;
  expireInSeconds?: number;
  recentRuns?: Array<{
    durationMs: number;
    ok: boolean;
    finishedAt: string;
  }>;
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
  "poll-jira-dispatch": "Phân phối đồng bộ Jira",
  "poll-jira": "Đồng bộ Jira (cũ)",
  "poll-jira-project": "Đồng bộ dự án Jira",
  "refresh-board-membership": "Làm mới thành viên board",
  "bulk-op": "Thao tác hàng loạt",
  "process-webhook": "Xử lý webhook",
};

const HEAVY_JOBS = new Set([
  "poll-pr-comments",
  "reconcile-deleted-issues",
  "capture-project-report-snapshots",
  "detect-people-fields",
]);

const NON_TRIGGERABLE_JOBS = new Set([
  "bulk-op",
  "process-webhook",
  "poll-jira-project",
  "poll-jira",
]);

export function JobsCard({
  jobs,
  failingJobs,
  runningJobs = [],
  stuckJobs = [],
  schedules = {},
  isLoading,
  onRefresh,
}: {
  jobs: ExtendedJobState[];
  failingJobs: ExtendedJobState[];
  runningJobs?: string[];
  stuckJobs?: string[];
  schedules?: Record<string, { cron: string; label: string }>;
  isLoading?: boolean;
  onRefresh?: () => void;
}) {
  const queryClient = useQueryClient();
  const [jobFilter, setJobFilter] = React.useState<"all" | "failing" | "running" | "stuck" | "never">("all");
  const [expandedJobKeys, setExpandedJobKeys] = React.useState<Set<string>>(new Set());
  const [confirmJob, setConfirmJob] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<{ text: string; tone: "success" | "danger" } | null>(null);

  const showToast = (text: string, tone: "success" | "danger" = "success") => {
    setToastMessage({ text, tone });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const toggleJobExpanded = (job: string) => {
    setExpandedJobKeys((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job);
      else next.add(job);
      return next;
    });
  };

  const runMutation = useMutation({
    mutationFn: async (jobName: string) => {
      return api<{ ok: boolean; jobId: string; name: string }>(
        `/api/admin/jobs/${encodeURIComponent(jobName)}/run`,
        { method: "POST" }
      );
    },
    onSuccess: (_, jobName) => {
      const label = JOB_LABELS[jobName] ?? jobName;
      showToast(`Đã xếp hàng chạy "${label}".`);
      setConfirmJob(null);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: adminKeys.overview });
        onRefresh?.();
      }, 2500);
    },
    onError: (err, jobName) => {
      const label = JOB_LABELS[jobName] ?? jobName;
      showToast(`Không thể chạy "${label}": ${getErrorMessage(err)}`, "danger");
      setConfirmJob(null);
    },
  });

  const handleTriggerClick = (jobName: string) => {
    if (HEAVY_JOBS.has(jobName)) {
      setConfirmJob(jobName);
    } else {
      runMutation.mutate(jobName);
    }
  };

  const runningJobsList = React.useMemo(
    () => jobs.filter((j) => runningJobs.includes(j.job) || j.isRunning),
    [jobs, runningJobs]
  );

  const stuckJobsList = React.useMemo(
    () => jobs.filter((j) => stuckJobs.includes(j.job) || j.isStuck),
    [jobs, stuckJobs]
  );

  const neverRanJobs = React.useMemo(
    () => jobs.filter((j) => !j.lastSuccessAt && !j.lastErrorAt),
    [jobs]
  );

  const sortedJobs = React.useMemo(() => {
    const list = [...jobs];
    return list.sort((a, b) => {
      const aStuck = stuckJobs.includes(a.job) || a.isStuck;
      const bStuck = stuckJobs.includes(b.job) || b.isStuck;
      if (aStuck && !bStuck) return -1;
      if (!aStuck && bStuck) return 1;

      const aFailing = failingJobs.some((fj) => fj.job === a.job);
      const bFailing = failingJobs.some((fj) => fj.job === b.job);
      if (aFailing && !bFailing) return -1;
      if (!aFailing && bFailing) return 1;

      const aRunning = runningJobs.includes(a.job) || a.isRunning;
      const bRunning = runningJobs.includes(b.job) || b.isRunning;
      if (aRunning && !bRunning) return -1;
      if (!aRunning && bRunning) return 1;

      if (!a.lastSuccessAt && b.lastSuccessAt) return -1;
      if (a.lastSuccessAt && !b.lastSuccessAt) return 1;
      if (a.lastSuccessAt && b.lastSuccessAt) {
        return new Date(a.lastSuccessAt).getTime() - new Date(b.lastSuccessAt).getTime();
      }
      return a.job.localeCompare(b.job);
    });
  }, [jobs, failingJobs, runningJobs, stuckJobs]);

  const filteredJobs = React.useMemo(() => {
    if (jobFilter === "failing") return failingJobs;
    if (jobFilter === "running") return runningJobsList;
    if (jobFilter === "stuck") return stuckJobsList;
    if (jobFilter === "never") return neverRanJobs;
    return sortedJobs;
  }, [jobFilter, failingJobs, runningJobsList, stuckJobsList, neverRanJobs, sortedJobs]);

  const now = React.useSyncExternalStore(
    (cb) => {
      const id = setInterval(cb, 15_000);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => 0
  );

  const renderBadge = (j: ExtendedJobState) => {
    const isStuck = stuckJobs.includes(j.job) || j.isStuck;
    const isRunning = runningJobs.includes(j.job) || j.isRunning;
    const isFailing = failingJobs.some((fj) => fj.job === j.job);

    if (isStuck) {
      const runningAge = j.lastStartedAt && now > 0 ? now - new Date(j.lastStartedAt).getTime() : null;
      return <Badge variant="danger">Treo · {formatDuration(runningAge)}</Badge>;
    }
    if (isRunning) {
      const runningAge = j.lastStartedAt && now > 0 ? now - new Date(j.lastStartedAt).getTime() : null;
      return <Badge variant="info">Đang chạy · {formatDuration(runningAge)}</Badge>;
    }
    if (isFailing) {
      return <Badge variant="danger">Lỗi</Badge>;
    }
    if (j.lastSuccessAt) {
      return <Badge variant="success">OK</Badge>;
    }
    return <Badge variant="secondary">Chưa chạy</Badge>;
  };

  const renderDuration = (j: ExtendedJobState) => {
    const duration = j.durationMs ?? (typeof j.stats?.durationMs === "number" ? j.stats.durationMs : null);
    if (duration == null) return <span className="text-muted-foreground">—</span>;

    const expireSeconds = j.expireInSeconds ?? 300;
    const ratio = duration / (expireSeconds * 1000);
    const colorClass =
      ratio > 0.8
        ? "text-rose-600 dark:text-rose-400 font-semibold"
        : ratio > 0.5
        ? "text-amber-600 dark:text-amber-400 font-medium"
        : "text-muted-foreground";

    return <span className={cn("tabular-nums text-xs", colorClass)}>{formatDuration(duration)}</span>;
  };

  return (
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
            { value: "running", label: "Đang chạy", count: runningJobsList.length },
            { value: "stuck", label: "Treo", count: stuckJobsList.length },
            { value: "never", label: "Chưa chạy", count: neverRanJobs.length },
          ]}
          value={jobFilter}
          onChange={setJobFilter}
          aria-label="Lọc danh sách job"
        />
      </CardHeader>
      <CardContent>
        {toastMessage && (
          <div
            className={cn(
              "mb-3 flex items-center gap-2 rounded-md border p-2.5 text-xs transition-opacity duration-200",
              toastMessage.tone === "success"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/20 bg-destructive/10 text-destructive"
            )}
            role="status"
          >
            {toastMessage.tone === "success" ? (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {isLoading ? (
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
            title={
              jobFilter === "failing"
                ? "Không có job nào lỗi"
                : jobFilter === "running"
                ? "Không có job nào đang chạy"
                : jobFilter === "stuck"
                ? "Không có job nào bị treo"
                : "Không có job phù hợp"
            }
            hint={
              jobFilter === "failing"
                ? "Tất cả các job đang chạy ổn định."
                : jobFilter === "running"
                ? "Worker hiện đang ở trạng thái rảnh."
                : jobFilter === "stuck"
                ? "Không có job nào vượt quá thời gian cho phép."
                : "Thử đổi bộ lọc sang tất cả."
            }
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
                    <TableHead className="w-28">Lịch</TableHead>
                    <TableHead className="w-24">Thời gian</TableHead>
                    <TableHead className="w-28">Xu hướng</TableHead>
                    <TableHead className="w-28">Thành công</TableHead>
                    <TableHead className="w-28">Lỗi gần nhất</TableHead>
                    <TableHead className="w-24 text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((j) => {
                    const failing = failingJobs.some((fj) => fj.job === j.job);
                    const isRunning = runningJobs.includes(j.job) || j.isRunning;
                    const isStuck = stuckJobs.includes(j.job) || j.isStuck;
                    const hasDetails = Boolean(j.lastError || (j.stats && Object.keys(j.stats).length > 0));
                    const isExpanded = expandedJobKeys.has(j.job);
                    const label = JOB_LABELS[j.job] ?? j.job;
                    const scheduleInfo = schedules[j.job] ?? { cron: "", label: "Theo sự kiện" };
                    const canTrigger = !NON_TRIGGERABLE_JOBS.has(j.job);
                    const isTriggerPending = runMutation.isPending && runMutation.variables === j.job;
                    const runs = j.recentRuns ?? (Array.isArray(j.stats?.recentRuns) ? (j.stats.recentRuns as Array<{ durationMs: number; ok: boolean }>) : []);
                    const hasFailedRun = runs.some((r) => !r.ok);

                    return (
                      <React.Fragment key={j.job}>
                        <TableRow
                          className={cn(
                            isStuck && "bg-rose-500/[0.06]",
                            failing && !isStuck && "bg-rose-500/[0.03]",
                            isRunning && !isStuck && "bg-sky-500/[0.03]"
                          )}
                        >
                          <TableCell className="py-2.5">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{label}</span>
                              <span className="font-mono text-xs text-muted-foreground">{j.job}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5">{renderBadge(j)}</TableCell>
                          <TableCell className="py-2.5 text-xs text-muted-foreground">
                            <span title={scheduleInfo.cron || undefined}>{scheduleInfo.label}</span>
                          </TableCell>
                          <TableCell className="py-2.5">{renderDuration(j)}</TableCell>
                          <TableCell className="py-2.5">
                            <Sparkline
                              data={runs.map((r) => r.durationMs)}
                              width={76}
                              height={20}
                              minPoints={4}
                              unit="ms"
                              tone={hasFailedRun ? "rose" : "teal"}
                              ariaLabel={`Xu hướng thời gian chạy của ${label}`}
                            />
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
                            <div className="flex items-center justify-end gap-1">
                              {canTrigger && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
                                  disabled={isRunning || isTriggerPending}
                                  onClick={() => handleTriggerClick(j.job)}
                                  title={`Chạy ngay: ${label}`}
                                  aria-label={`Chạy ngay ${label}`}
                                >
                                  <Play
                                    className={cn("h-3.5 w-3.5", isTriggerPending && "animate-spin")}
                                    aria-hidden="true"
                                  />
                                </Button>
                              )}
                              {hasDetails && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
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
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasDetails && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={8} className="px-4 py-2.5">
                              <div className="flex flex-col gap-2.5">
                                {j.lastError && (
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
                                        Thông báo lỗi gần nhất
                                      </span>
                                      <CopyButton text={maskSecrets(j.lastError)} />
                                    </div>
                                    <pre className="mt-1 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                                      {maskSecrets(j.lastError)}
                                    </pre>
                                  </div>
                                )}
                                {(() => {
                                  const statsEntries = parseStats(j.stats);
                                  if (statsEntries.length === 0) return null;
                                  return (
                                    <div>
                                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Thống kê (stats)
                                      </span>
                                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                                        {statsEntries.map((entry) =>
                                          entry.isBadge ? (
                                            <Badge
                                              key={entry.key}
                                              variant={entry.tone ?? "warning"}
                                              className="text-[11px]"
                                            >
                                              {entry.value}
                                            </Badge>
                                          ) : (
                                            <span
                                              key={entry.key}
                                              className="rounded border border-border/60 bg-muted/70 px-2 py-0.5 font-mono text-[11px]"
                                            >
                                              <span className="text-muted-foreground">{entry.label}: </span>
                                              <span className="font-semibold text-foreground">{entry.value}</span>
                                            </span>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
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
                const failing = failingJobs.some((fj) => fj.job === j.job);
                const isRunning = runningJobs.includes(j.job) || j.isRunning;
                const isStuck = stuckJobs.includes(j.job) || j.isStuck;
                const hasDetails = Boolean(j.lastError || (j.stats && Object.keys(j.stats).length > 0));
                const isExpanded = expandedJobKeys.has(j.job);
                const label = JOB_LABELS[j.job] ?? j.job;
                const scheduleInfo = schedules[j.job] ?? { cron: "", label: "Theo sự kiện" };
                const canTrigger = !NON_TRIGGERABLE_JOBS.has(j.job);
                const isTriggerPending = runMutation.isPending && runMutation.variables === j.job;

                return (
                  <div key={j.job} className={cn("flex flex-col gap-1.5 py-3", isStuck && "bg-rose-500/[0.06] rounded-md px-2")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{label}</span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="font-mono">{j.job}</span>
                          <span>·</span>
                          <span>{scheduleInfo.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {renderBadge(j)}
                        {canTrigger && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 cursor-pointer p-0"
                            disabled={isRunning || isTriggerPending}
                            onClick={() => handleTriggerClick(j.job)}
                            aria-label={`Chạy ngay ${label}`}
                          >
                            <Play className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Thời gian: {renderDuration(j)}</span>
                      <span>·</span>
                      <span>Thành công: {j.lastSuccessAt ? timeAgo(j.lastSuccessAt) : "chưa từng"}</span>
                      {j.lastErrorAt && (
                        <>
                          <span>·</span>
                          <span className={cn(failing && "font-medium text-destructive")}>
                            Lỗi: {timeAgo(j.lastErrorAt)}
                          </span>
                        </>
                      )}
                    </div>

                    {(() => {
                      const runs = j.recentRuns ?? (Array.isArray(j.stats?.recentRuns) ? (j.stats.recentRuns as Array<{ durationMs: number; ok: boolean }>) : []);
                      if (runs.length < 4) return null;
                      const hasFailed = runs.some((r) => !r.ok);
                      return (
                        <div className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
                          <span className="text-[11px]">Xu hướng:</span>
                          <Sparkline
                            data={runs.map((r) => r.durationMs)}
                            width={80}
                            height={18}
                            minPoints={4}
                            unit="ms"
                            tone={hasFailed ? "rose" : "teal"}
                            ariaLabel={`Xu hướng thời gian chạy của ${label}`}
                          />
                        </div>
                      );
                    })()}

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
                          <div className="mt-2 flex flex-col gap-2 rounded bg-muted/20 p-2.5">
                            {j.lastError && (
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-destructive">Lỗi:</span>
                                  <CopyButton text={maskSecrets(j.lastError)} />
                                </div>
                                <pre className="mt-1 max-h-40 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
                                  {maskSecrets(j.lastError)}
                                </pre>
                              </div>
                            )}
                            {(() => {
                              const statsEntries = parseStats(j.stats);
                              if (statsEntries.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-1 text-xs">
                                  {statsEntries.map((e) => (
                                    <span key={e.key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                                      {e.label}: {e.value}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
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

      <ConfirmDialog
        open={confirmJob !== null}
        onOpenChange={(open) => !open && setConfirmJob(null)}
        title={`Chạy job ${confirmJob ? JOB_LABELS[confirmJob] ?? confirmJob : ""}?`}
        description={
          confirmJob === "poll-pr-comments"
            ? "Job này quét toàn bộ 80+ kho lưu trữ Bitbucket và có thể mất từ 10–15 phút. Bạn có chắc muốn kích hoạt ngay bây giờ?"
            : confirmJob === "reconcile-deleted-issues"
            ? "Job này kiểm tra toàn bộ danh sách issue đã xoá trên tất cả các dự án đã bật đồng bộ."
            : confirmJob === "capture-project-report-snapshots"
            ? "Job này tính toán và chụp snapshot báo cáo cho toàn bộ dự án."
            : "Job này thực hiện quét dữ liệu nặng trên hệ thống."
        }
        confirmLabel="Chạy ngay"
        cancelLabel="Hủy"
        pending={runMutation.isPending}
        onConfirm={() => {
          if (confirmJob) runMutation.mutate(confirmJob);
        }}
      />
    </Card>
  );
}
