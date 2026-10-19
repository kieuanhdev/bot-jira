"use client";

import * as React from "react";
import { ChevronRight, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo } from "@/lib/utils";
import { CopyButton } from "../error-sheet";
import { formatDuration, parseStats } from "../format-stats";
import { Sparkline } from "../sparkline";
import type { JobRowComputed } from "./use-job-rows";

export function JobTableHeader() {
  return (
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
  );
}

export interface JobTableRowProps {
  row: JobRowComputed;
  isExpanded: boolean;
  isTriggerPending: boolean;
  onToggleExpand: () => void;
  onTrigger: () => void;
}

export function JobTableRow({
  row,
  isExpanded,
  isTriggerPending,
  onToggleExpand,
  onTrigger,
}: JobTableRowProps) {
  const { raw } = row;
  const statsEntries = parseStats(raw.stats);

  return (
    <React.Fragment>
      <TableRow
        className={cn(
          row.isStuck && "bg-destructive/[0.06]",
          row.isFailing && !row.isStuck && "bg-destructive/[0.03]",
          row.isRunning && !row.isStuck && "bg-info/[0.03]"
        )}
      >
        <TableCell className="py-2.5">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{row.job}</span>
          </div>
        </TableCell>

        <TableCell className="py-2.5">
          {row.isStuck ? (
            <Badge variant="danger">Treo · {formatDuration(row.runningAge)}</Badge>
          ) : row.isRunning ? (
            <Badge variant="info">Đang chạy · {formatDuration(row.runningAge)}</Badge>
          ) : row.isFailing ? (
            <Badge variant="danger">Lỗi</Badge>
          ) : raw.lastSuccessAt ? (
            <Badge variant="success">OK</Badge>
          ) : (
            <Badge variant="secondary">Chưa chạy</Badge>
          )}
        </TableCell>

        <TableCell className="py-2.5 text-xs text-muted-foreground">
          <span title={row.scheduleInfo.cron || undefined}>{row.scheduleInfo.label}</span>
        </TableCell>

        <TableCell className="py-2.5">
          {row.formattedDuration ? (
            <span className={cn("tabular-nums text-xs", row.durationColorClass)}>
              {row.formattedDuration}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        <TableCell className="py-2.5">
          <Sparkline
            data={row.runs.map((r) => r.durationMs)}
            width={76}
            height={20}
            minPoints={4}
            unit="ms"
            tone={row.hasFailedRun ? "rose" : "teal"}
            ariaLabel={`Xu hướng thời gian chạy của ${row.label}`}
          />
        </TableCell>

        <TableCell className="py-2.5 text-xs text-muted-foreground">
          {raw.lastSuccessAt ? timeAgo(raw.lastSuccessAt) : "chưa từng"}
        </TableCell>

        <TableCell className="py-2.5 text-xs text-muted-foreground">
          {raw.lastErrorAt ? (
            <span className={cn(row.isFailing && "font-medium text-destructive")}>
              {timeAgo(raw.lastErrorAt)}
            </span>
          ) : (
            "—"
          )}
        </TableCell>

        <TableCell className="py-2.5 text-right">
          <div className="flex items-center justify-end gap-1">
            {row.canTrigger && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
                disabled={row.isRunning || isTriggerPending}
                onClick={onTrigger}
                title={`Chạy ngay: ${row.label}`}
                aria-label={`Chạy ngay ${row.label}`}
              >
                <Play
                  className={cn("h-3.5 w-3.5", isTriggerPending && "animate-spin")}
                  aria-hidden="true"
                />
              </Button>
            )}
            {row.hasDetails && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
                onClick={onToggleExpand}
                aria-expanded={isExpanded}
                aria-label={`Chi tiết job ${row.label}`}
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

      {isExpanded && row.hasDetails && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={8} className="px-4 py-2.5">
            <div className="flex flex-col gap-2.5">
              {raw.lastError && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-semibold uppercase tracking-wider text-destructive">
                      Thông báo lỗi gần nhất
                    </span>
                    <CopyButton text={maskSecrets(raw.lastError)} />
                  </div>
                  <pre className="mt-1 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                    {maskSecrets(raw.lastError)}
                  </pre>
                </div>
              )}
              {statsEntries.length > 0 && (
                <div>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Thống kê (stats)
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {statsEntries.map((entry) =>
                      entry.isBadge ? (
                        <Badge
                          key={entry.key}
                          variant={entry.tone ?? "warning"}
                          className="text-2xs"
                        >
                          {entry.value}
                        </Badge>
                      ) : (
                        <span
                          key={entry.key}
                          className="rounded border border-border/60 bg-muted/70 px-2 py-0.5 font-mono text-2xs"
                        >
                          <span className="text-muted-foreground">{entry.label}: </span>
                          <span className="font-semibold text-foreground">{entry.value}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
}
