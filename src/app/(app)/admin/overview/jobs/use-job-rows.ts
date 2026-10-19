import { useMemo } from "react";
import { formatDuration } from "../format-stats";

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

export type JobFilter = "all" | "failing" | "running" | "stuck" | "never";

export const JOB_LABELS: Record<string, string> = {
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

export const HEAVY_JOBS = new Set([
  "poll-pr-comments",
  "reconcile-deleted-issues",
  "capture-project-report-snapshots",
  "detect-people-fields",
]);

export const NON_TRIGGERABLE_JOBS = new Set([
  "bulk-op",
  "process-webhook",
  "poll-jira-project",
  "poll-jira",
]);

export function getJobConfirmDescription(jobName: string | null): string {
  if (jobName === "poll-pr-comments") {
    return "Job này quét toàn bộ 80+ kho lưu trữ Bitbucket và có thể mất từ 10–15 phút. Bạn có chắc muốn kích hoạt ngay bây giờ?";
  }
  if (jobName === "reconcile-deleted-issues") {
    return "Job này kiểm tra toàn bộ danh sách issue đã xoá trên tất cả các dự án đã bật đồng bộ.";
  }
  if (jobName === "capture-project-report-snapshots") {
    return "Job này tính toán và chụp snapshot báo cáo cho toàn bộ dự án.";
  }
  return "Job này thực hiện quét dữ liệu nặng trên hệ thống.";
}

export interface JobRowComputed {
  raw: ExtendedJobState;
  job: string;
  label: string;
  isFailing: boolean;
  isRunning: boolean;
  isStuck: boolean;
  hasDetails: boolean;
  scheduleInfo: { cron: string; label: string };
  canTrigger: boolean;
  runs: Array<{ durationMs: number; ok: boolean }>;
  hasFailedRun: boolean;
  formattedDuration: string | null;
  durationColorClass: string;
  runningAge: number | null;
}

export interface UseJobRowsOptions {
  jobs: ExtendedJobState[];
  failingJobs: ExtendedJobState[];
  runningJobs?: string[];
  stuckJobs?: string[];
  schedules?: Record<string, { cron: string; label: string }>;
  jobFilter: JobFilter;
  now?: number;
}

export function useJobRows({
  jobs,
  failingJobs,
  runningJobs = [],
  stuckJobs = [],
  schedules = {},
  jobFilter,
  now = 0,
}: UseJobRowsOptions) {
  // Precompute Set lookups for O(1) checks per row
  const failingSet = useMemo(
    () => new Set(failingJobs.map((fj) => fj.job)),
    [failingJobs]
  );

  const runningSet = useMemo(
    () => new Set([...runningJobs, ...jobs.filter((j) => j.isRunning).map((j) => j.job)]),
    [runningJobs, jobs]
  );

  const stuckSet = useMemo(
    () => new Set([...stuckJobs, ...jobs.filter((j) => j.isStuck).map((j) => j.job)]),
    [stuckJobs, jobs]
  );

  // Precomputed job rows with O(1) flags
  const computedRows = useMemo<JobRowComputed[]>(() => {
    return jobs.map((j) => {
      const isFailing = failingSet.has(j.job);
      const isRunning = runningSet.has(j.job);
      const isStuck = stuckSet.has(j.job);
      const hasDetails = Boolean(j.lastError || (j.stats && Object.keys(j.stats).length > 0));
      const label = JOB_LABELS[j.job] ?? j.job;
      const scheduleInfo = schedules[j.job] ?? { cron: "", label: "Theo sự kiện" };
      const canTrigger = !NON_TRIGGERABLE_JOBS.has(j.job);

      const runs =
        j.recentRuns ??
        (Array.isArray(j.stats?.recentRuns)
          ? (j.stats.recentRuns as Array<{ durationMs: number; ok: boolean }>)
          : []);
      const hasFailedRun = runs.some((r) => !r.ok);

      const duration =
        j.durationMs ?? (typeof j.stats?.durationMs === "number" ? j.stats.durationMs : null);
      const formattedDuration = duration != null ? formatDuration(duration) : null;

      const expireSeconds = j.expireInSeconds ?? 300;
      const ratio = duration != null ? duration / (expireSeconds * 1000) : 0;
      const durationColorClass =
        ratio > 0.8
          ? "text-destructive font-semibold"
          : ratio > 0.5
          ? "text-warning font-medium"
          : "text-muted-foreground";

      const runningAge =
        (isRunning || isStuck) && j.lastStartedAt && now > 0
          ? now - new Date(j.lastStartedAt).getTime()
          : null;

      return {
        raw: j,
        job: j.job,
        label,
        isFailing,
        isRunning,
        isStuck,
        hasDetails,
        scheduleInfo,
        canTrigger,
        runs,
        hasFailedRun,
        formattedDuration,
        durationColorClass,
        runningAge,
      };
    });
  }, [jobs, failingSet, runningSet, stuckSet, schedules, now]);

  // Sort rows: stuck first, failing next, running next, then lastSuccessAt, then alphabetical
  const sortedRows = useMemo(() => {
    const list = [...computedRows];
    return list.sort((a, b) => {
      if (a.isStuck && !b.isStuck) return -1;
      if (!a.isStuck && b.isStuck) return 1;

      if (a.isFailing && !b.isFailing) return -1;
      if (!a.isFailing && b.isFailing) return 1;

      if (a.isRunning && !b.isRunning) return -1;
      if (!a.isRunning && b.isRunning) return 1;

      if (!a.raw.lastSuccessAt && b.raw.lastSuccessAt) return -1;
      if (a.raw.lastSuccessAt && !b.raw.lastSuccessAt) return 1;
      if (a.raw.lastSuccessAt && b.raw.lastSuccessAt) {
        return (
          new Date(a.raw.lastSuccessAt).getTime() - new Date(b.raw.lastSuccessAt).getTime()
        );
      }
      return a.job.localeCompare(b.job);
    });
  }, [computedRows]);

  const filteredRows = useMemo(() => {
    if (jobFilter === "failing") return sortedRows.filter((r) => r.isFailing);
    if (jobFilter === "running") return sortedRows.filter((r) => r.isRunning);
    if (jobFilter === "stuck") return sortedRows.filter((r) => r.isStuck);
    if (jobFilter === "never")
      return sortedRows.filter((r) => !r.raw.lastSuccessAt && !r.raw.lastErrorAt);
    return sortedRows;
  }, [jobFilter, sortedRows]);

  const counts = useMemo(() => {
    let running = 0;
    let stuck = 0;
    let never = 0;
    for (const r of computedRows) {
      if (r.isRunning) running++;
      if (r.isStuck) stuck++;
      if (!r.raw.lastSuccessAt && !r.raw.lastErrorAt) never++;
    }
    return {
      all: computedRows.length,
      failing: failingJobs.length,
      running,
      stuck,
      never,
    };
  }, [computedRows, failingJobs.length]);

  return {
    rows: filteredRows,
    counts,
  };
}
