"use client";

import { timeAgo } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface BoardStatsLineProps {
  summary: { open: number; inProgress: number; stale: number; done: number };
  loading: boolean;
  issueCount: number;
  lastSuccessAt: string | null | undefined;
}

/** One quiet line of board totals instead of a row of metric cards. */
export function BoardStatsLine({ summary, loading, issueCount, lastSuccessAt }: BoardStatsLineProps) {
  if (loading) return <Skeleton className="h-4 w-72" />;
  const items: Array<[string, number, string?]> = [
    ["Mở", summary.open],
    ["Đang làm", summary.inProgress],
    ["Tồn đọng 7d+", summary.stale, summary.stale > 0 ? "text-amber-600 dark:text-amber-400" : undefined],
    ["Hoàn thành", summary.done],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        <span className="font-semibold text-foreground tabular-nums">{issueCount}</span> task
      </span>
      {items.map(([label, value, tone]) => (
        <span key={label}>
          {label} <span className={`font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</span>
        </span>
      ))}
      {lastSuccessAt ? <span className="ml-auto">Đồng bộ {timeAgo(lastSuccessAt)}</span> : null}
    </div>
  );
}
