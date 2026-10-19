"use client";

import { ChevronRight, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo } from "@/lib/utils";
import { CopyButton } from "../error-sheet";
import { formatDuration, parseStats } from "../format-stats";
import { Sparkline } from "../sparkline";
import type { JobRowComputed } from "./use-job-rows";

export interface JobMobileItemProps {
  row: JobRowComputed;
  isExpanded: boolean;
  isTriggerPending: boolean;
  onToggleExpand: () => void;
  onTrigger: () => void;
}

export function JobMobileItem({
  row,
  isExpanded,
  isTriggerPending,
  onToggleExpand,
  onTrigger,
}: JobMobileItemProps) {
  const { raw } = row;
  const statsEntries = parseStats(raw.stats);

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 py-3",
        row.isStuck && "bg-destructive/[0.06] rounded-md px-2"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.label}</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{row.job}</span>
            <span>·</span>
            <span>{row.scheduleInfo.label}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
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

          {row.canTrigger && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 cursor-pointer p-0"
              disabled={row.isRunning || isTriggerPending}
              onClick={onTrigger}
              aria-label={`Chạy ngay ${row.label}`}
            >
              <Play className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>Thời gian: {row.formattedDuration ?? "—"}</span>
        <span>·</span>
        <span>Thành công: {raw.lastSuccessAt ? timeAgo(raw.lastSuccessAt) : "chưa từng"}</span>
        {raw.lastErrorAt && (
          <>
            <span>·</span>
            <span className={cn(row.isFailing && "font-medium text-destructive")}>
              Lỗi: {timeAgo(raw.lastErrorAt)}
            </span>
          </>
        )}
      </div>

      {row.runs.length >= 4 && (
        <div className="flex items-center gap-2 pt-0.5 text-xs text-muted-foreground">
          <span className="text-2xs">Xu hướng:</span>
          <Sparkline
            data={row.runs.map((r) => r.durationMs)}
            width={80}
            height={18}
            minPoints={4}
            unit="ms"
            tone={row.hasFailedRun ? "rose" : "teal"}
            ariaLabel={`Xu hướng thời gian chạy của ${row.label}`}
          />
        </div>
      )}

      {row.hasDetails && (
        <div className="mt-1">
          <button
            type="button"
            onClick={onToggleExpand}
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
              {raw.lastError && (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-semibold text-destructive">Lỗi:</span>
                    <CopyButton text={maskSecrets(raw.lastError)} />
                  </div>
                  <pre className="mt-1 max-h-40 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
                    {maskSecrets(raw.lastError)}
                  </pre>
                </div>
              )}
              {statsEntries.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs">
                  {statsEntries.map((e) => (
                    <span
                      key={e.key}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs"
                    >
                      {e.label}: {e.value}
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
}
