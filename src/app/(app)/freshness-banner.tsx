"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { freshnessKeys } from "@/lib/query-keys";
import { TriangleAlert, WifiOff } from "lucide-react";

type Freshness = {
  status: "healthy" | "degraded" | "down" | "unknown";
  jiraFresh: boolean;
  workerAgeMs: number | null;
  jiraSyncAgeMs: number | null;
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

  return (
    <div
      className={
        "flex items-center gap-2 border-b px-4 py-2 text-sm " +
        (down
          ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-300/40"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/40")
      }
      role="status"
    >
      {down ? <WifiOff className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 truncate">
        {down ? (
          <>Tiến trình nền (Worker) bị gián đoạn — dữ liệu có thể đã cũ. Tín hiệu cuối cách đây {secondsLabel(data.workerAgeMs)}.</>
        ) : (
          <>Dữ liệu chưa mới — đồng bộ Jira lần cuối cách đây {secondsLabel(data.jiraSyncAgeMs)}.</>
        )}
      </span>
      {stale && <span className="ml-auto shrink-0 text-xs opacity-70">Kiểm tra phát hành có thể bị chặn cho đến khi dữ liệu mới</span>}
    </div>
  );
}
