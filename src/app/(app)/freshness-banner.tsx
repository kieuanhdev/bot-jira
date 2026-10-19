"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { freshnessKeys } from "@/lib/query-keys";
import { nameList, splitFailureNames } from "@/lib/health/freshness-labels";
import { TriangleAlert, WifiOff } from "lucide-react";

type Freshness = {
  status: "healthy" | "degraded" | "down" | "unknown";
  jiraFresh: boolean;
  workerAgeMs: number | null;
  jiraSyncAgeMs: number | null;
  staleProjects?: string[];
  failingProjects?: string[];
  failingJobs?: string[];
};

function secondsLabel(ms: number | null): string {
  if (ms === null) return "unknown";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return `${m}m`;
}

/**
 * OPS-03 — App-wide stale-data banner. Polls the public freshness endpoint and
 * shows a single dismissible banner when the worker is down or Jira data is no
 * longer fresh. Hidden when healthy or when the worker has never been seen.
 *
 * The degraded copy names what is actually failing — the Jira projects whose
 * sync errored, or the worker jobs that errored — so the generic
 * "một số tác vụ nền" wording is only the last-resort fallback.
 */
export function FreshnessBanner() {
  const { data } = useQuery<Freshness>({
    queryKey: freshnessKeys.all,
    queryFn: () => api<Freshness>("/api/freshness"),
    refetchInterval: 30_000,
    retry: 0,
  });

  if (!data) return null;
  if (data.status === "healthy") return null;
  if (data.status === "unknown") return null;

  const down = data.status === "down";
  const stale = !data.jiraFresh && !down;

  const staleProjects = data.staleProjects ?? [];
  const failing = splitFailureNames(data.failingProjects ?? [], data.failingJobs ?? []);

  // Full, untruncated list for the hover tooltip.
  const tooltip = down
    ? undefined
    : (stale ? staleProjects : [...failing.projects, ...failing.jobs]).join(", ") || undefined;

  return (
    <div
      className={
        "flex items-center gap-2 border-b px-4 py-2 text-sm " +
        (down
          ? "bg-destructive/12 text-destructive border-destructive/30"
          : "bg-warning/12 text-warning border-warning/30")
      }
      role="status"
      title={tooltip}
    >
      {down ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 truncate">
        {down ? (
          <>Tiến trình nền (Worker) bị gián đoạn — dữ liệu có thể đã cũ. Tín hiệu cuối cách đây {secondsLabel(data.workerAgeMs)}.</>
        ) : !data.jiraFresh ? (
          staleProjects.length > 0 ? (
            <>Dữ liệu Jira chưa mới — dự án {nameList(staleProjects)} chưa đồng bộ (lần cuối cách đây {secondsLabel(data.jiraSyncAgeMs)}).</>
          ) : (
            <>Dữ liệu Jira chưa mới — đồng bộ Jira lần cuối cách đây {secondsLabel(data.jiraSyncAgeMs)}.</>
          )
        ) : failing.projects.length > 0 ? (
          <>Đồng bộ Jira đang lỗi ở dự án {nameList(failing.projects)} — các dự án khác vẫn bình thường (lần cuối cách đây {secondsLabel(data.jiraSyncAgeMs)}).</>
        ) : failing.jobs.length > 0 ? (
          <>Tác vụ nền đang gặp sự cố: {nameList(failing.jobs)} — đồng bộ Jira vẫn hoạt động bình thường (lần cuối cách đây {secondsLabel(data.jiraSyncAgeMs)}).</>
        ) : (
          <>Một số tác vụ nền đang gặp sự cố — đồng bộ Jira vẫn hoạt động bình thường (lần cuối cách đây {secondsLabel(data.jiraSyncAgeMs)}).</>
        )}
      </span>
      {stale && <span className="ml-auto shrink-0 text-xs opacity-70">Kiểm tra phát hành có thể bị chặn cho đến khi dữ liệu mới</span>}
    </div>
  );
}
