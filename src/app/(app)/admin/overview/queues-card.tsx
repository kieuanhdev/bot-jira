"use client";

import * as React from "react";
import { Layers, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/async-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { cn, formatNumber } from "@/lib/utils";
import { getReleaseGateLabel } from "./format-stats";

export type BarSegment = {
  label: string;
  count: number;
  color: string;
  dotColor?: string;
};

export function StackedBar({
  title,
  subtitle,
  segments,
  emptyHint = "Chưa có dữ liệu",
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  segments: BarSegment[];
  emptyHint?: string;
  action?: React.ReactNode;
}) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="flex flex-col justify-between rounded-lg border border-border bg-card p-3.5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          <div className="flex items-center gap-1.5">
            {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
            {action}
          </div>
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
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(s.count)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function QueuesCard({
  outbox = {},
  sentry = {},
  releases = {},
  gates = {},
  bulkOps = {},
  ai,
  isLoading,
  error,
  onRetry,
  onOpenErrorSheet,
}: {
  outbox?: Record<string, number>;
  sentry?: Record<string, number>;
  releases?: Record<string, number>;
  gates?: Record<string, Record<string, number>>;
  bulkOps?: Record<string, number>;
  ai?: {
    scores: number;
    fallbackScores?: number;
    realScores?: number;
    decisions: Record<string, number>;
    defaultPoint: number;
    pointScale: number[];
  };
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onOpenErrorSheet?: (type: "sentry" | "outbox") => void;
}) {
  const releaseSegments: BarSegment[] = React.useMemo(() => {
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
  }, [releases]);

  const bulkSegments: BarSegment[] = React.useMemo(() => {
    const base = [
      { label: "Xem trước", count: bulkOps.preview ?? 0, color: "bg-muted-foreground/40", dotColor: "bg-muted-foreground/40" },
      { label: "Hàng đợi", count: bulkOps.queued ?? 0, color: "bg-sky-500", dotColor: "bg-sky-500" },
      { label: "Đang chạy", count: bulkOps.running ?? 0, color: "bg-indigo-500", dotColor: "bg-indigo-500" },
      { label: "Hoàn tất", count: bulkOps.completed ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
      { label: "Lỗi một phần", count: bulkOps.partially_failed ?? 0, color: "bg-amber-500", dotColor: "bg-amber-500" },
      { label: "Lỗi", count: bulkOps.failed ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
      { label: "Đã hủy", count: bulkOps.cancelled ?? 0, color: "bg-slate-400", dotColor: "bg-slate-400" },
    ].filter((s) => s.count > 0);

    if (base.length > 0) return base;
    for (const [k, v] of Object.entries(bulkOps)) {
      if (v > 0) base.push({ label: k, count: v, color: "bg-primary", dotColor: "bg-primary" });
    }
    return base;
  }, [bulkOps]);

  const aiSegments: BarSegment[] = React.useMemo(() => {
    if (!ai) return [];
    const real = ai.realScores ?? Math.max(0, ai.scores - (ai.fallbackScores ?? 0));
    const fallback = ai.fallbackScores ?? 0;

    return [
      { label: "AI thật", count: real, color: "bg-teal-500", dotColor: "bg-teal-500" },
      { label: "Mặc định", count: fallback, color: "bg-amber-500", dotColor: "bg-amber-500" },
    ].filter((s) => s.count > 0);
  }, [ai]);

  const gateEntries = Object.entries(gates);

  return (
    <Card id="queues">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Hàng đợi & tích hợp
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ảnh chụp tức thời từ hàng đợi thông báo, lỗi Sentry, phiên phát hành, thao tác hàng loạt và AI.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState
            title="Không thể tải dữ liệu hàng đợi"
            message={error instanceof Error ? error.message : String(error)}
            onRetry={onRetry}
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StackedBar
                title="Thông báo Outbox"
                action={
                  (outbox.failed ?? 0) > 0 && onOpenErrorSheet ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 cursor-pointer px-1.5 text-xs text-destructive hover:text-destructive"
                      onClick={() => onOpenErrorSheet("outbox")}
                    >
                      Xem lỗi ({outbox.failed})
                    </Button>
                  ) : null
                }
                segments={[
                  { label: "Chờ", count: outbox.pending ?? 0, color: "bg-sky-500", dotColor: "bg-sky-500" },
                  { label: "Đã gửi", count: outbox.sent ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
                  { label: "Lỗi", count: outbox.failed ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
                ]}
              />

              <StackedBar
                title="Nhập lỗi Sentry"
                action={
                  (sentry.failed ?? 0) > 0 && onOpenErrorSheet ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 cursor-pointer px-1.5 text-xs text-destructive hover:text-destructive"
                      onClick={() => onOpenErrorSheet("sentry")}
                    >
                      Xem lỗi ({sentry.failed})
                    </Button>
                  ) : null
                }
                segments={[
                  {
                    label: "Chờ duyệt",
                    count: (sentry.review ?? 0) + (sentry.pending ?? 0),
                    color: "bg-amber-500",
                    dotColor: "bg-amber-500",
                  },
                  { label: "Đang tạo", count: sentry.approved ?? 0, color: "bg-sky-500", dotColor: "bg-sky-500" },
                  { label: "Đã tạo", count: sentry.created ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
                  { label: "Lỗi", count: sentry.failed ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
                  {
                    label: "Bỏ qua",
                    count: (sentry.ignored ?? 0) + (sentry.rejected ?? 0),
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
                title="Đánh giá AI (ước lượng)"
                subtitle={ai ? `${ai.scores} lượt` : undefined}
                segments={aiSegments}
                emptyHint="Chưa có đánh giá AI"
              />
            </div>

            {/* Bulk operations row */}
            {bulkSegments.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Thao tác hàng loạt (7 ngày qua)
                </span>
                <StackedBar
                  title="Trạng thái thực thi thao tác"
                  segments={bulkSegments}
                  emptyHint="Chưa có thao tác hàng loạt nào"
                />
              </div>
            )}

            {/* Release Gate Rollup (A1, G1) */}
            {gateEntries.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-lg border border-border/80 bg-muted/10 p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs font-semibold text-foreground">
                      Cổng kiểm tra phát hành (200 kết quả gần nhất)
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {gateEntries.map(([gateName, stateMap]) => {
                    const label = getReleaseGateLabel(gateName);
                    const segments: BarSegment[] = [
                      { label: "Đạt", count: stateMap.passed ?? 0, color: "bg-emerald-500", dotColor: "bg-emerald-500" },
                      { label: "Lỗi", count: stateMap.failed ?? 0, color: "bg-rose-500", dotColor: "bg-rose-500" },
                      { label: "Không rõ", count: stateMap.unknown ?? 0, color: "bg-amber-500", dotColor: "bg-amber-500" },
                      { label: "Ghi đè", count: stateMap.overridden ?? 0, color: "bg-purple-500", dotColor: "bg-purple-500" },
                    ];

                    return (
                      <StackedBar
                        key={gateName}
                        title={label}
                        subtitle={<span className="font-mono text-[10px] text-muted-foreground">{gateName}</span>}
                        segments={segments}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
