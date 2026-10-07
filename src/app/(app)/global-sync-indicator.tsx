"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, X } from "lucide-react";
import { useActiveSync } from "@/hooks/use-active-sync";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function GlobalSyncIndicator() {
  const { syncingProjects, justFinished, isAnySyncing } = useActiveSync();
  const [dismissedProjects, setDismissedProjects] = useState<string[]>([]);

  // Dismissed only when all currently syncing projects were already dismissed
  const isDismissed =
    syncingProjects.length > 0 &&
    syncingProjects.every((p) => dismissedProjects.includes(p));

  // Show if currently syncing or just finished
  const hasFinished = justFinished.length > 0;
  const isVisible = (isAnySyncing && !isDismissed) || hasFinished;

  if (!isVisible) return null;

  return (
    <aside
      aria-label="Trạng thái đồng bộ dữ liệu"
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-4 right-4 z-40 md:bottom-6 md:right-6",
        "flex max-w-sm items-center gap-3 rounded-full border px-4 py-2.5 shadow-lg backdrop-blur-md",
        "transition-all duration-300 ease-out",
        hasFinished && !isAnySyncing
          ? "border-emerald-500/30 bg-card/95 text-foreground ring-1 ring-emerald-500/20"
          : "border-primary/30 bg-card/95 text-foreground ring-1 ring-primary/20 shadow-primary/5"
      )}
    >
      {/* Icon with animation */}
      <div className="relative flex shrink-0 items-center justify-center">
        {hasFinished && !isAnySyncing ? (
          <CheckCircle2
            className="h-4.5 w-4.5 text-emerald-500 animate-in zoom-in-75 duration-200"
            aria-hidden="true"
          />
        ) : (
          <div className="relative flex items-center justify-center">
            <RefreshCw
              className="h-4.5 w-4.5 text-primary animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/75 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold tracking-tight text-foreground">
            {hasFinished && !isAnySyncing
              ? "Đã đồng bộ xong"
              : "Đang đồng bộ dữ liệu"}
          </span>

          {/* Project Badges */}
          {syncingProjects.length > 0 &&
            syncingProjects.slice(0, 2).map((key) => (
              <Badge
                key={key}
                variant="outline"
                className="h-4.5 border-primary/30 bg-primary/10 px-1 text-[10px] font-bold text-primary font-mono"
              >
                {key}
              </Badge>
            ))}

          {syncingProjects.length > 2 && (
            <Badge
              variant="outline"
              className="h-4.5 border-border bg-muted px-1 text-[10px] text-muted-foreground font-mono"
            >
              +{syncingProjects.length - 2}
            </Badge>
          )}

          {hasFinished &&
            !isAnySyncing &&
            justFinished.slice(0, 2).map((key) => (
              <Badge
                key={key}
                variant="outline"
                className="h-4.5 border-emerald-500/30 bg-emerald-500/10 px-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono"
              >
                {key}
              </Badge>
            ))}
        </div>

        <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
          {hasFinished && !isAnySyncing
            ? "Dữ liệu đã được cập nhật mới nhất"
            : "Đang cập nhật thay đổi mới nhất từ Jira…"}
        </p>
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={() => setDismissedProjects(syncingProjects)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
        aria-label="Đóng thông báo đồng bộ"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </aside>
  );
}
