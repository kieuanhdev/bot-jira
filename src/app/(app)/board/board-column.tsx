"use client";

import { useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, EyeOff, Maximize2, Minimize2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { IssueItem } from "@/hooks/use-issues";
import type { QuickAction } from "./lib/board-types";
import { statusText } from "./lib/board-utils";
import { DraggableCard } from "./board-card";

export function BoardColumn({
  id,
  label,
  category,
  isDone,
  isBacklog,
  emptyMessage,
  items,
  total,
  colIndex,
  columnCount,
  onTransition,
  busy,
  dndDisabled,
  onOverChange,
  dotColor,
  dragBlocked,
  optimistic,
  wipOver,
  collapsed,
  canHide,
  onGrow,
  onToggleCollapse,
  onHideColumn,
  onOpen,
  onQuickAction,
  assignees,
  registerRef,
  focusKey,
}: {
  id: string;
  label: string;
  category: string;
  isDone: boolean;
  isBacklog?: boolean;
  emptyMessage?: string;
  items: IssueItem[];
  total: number;
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
  onOverChange: (over: boolean) => void;
  dotColor: string;
  dragBlocked?: boolean;
  optimistic: Map<string, string>;
  wipOver: boolean;
  collapsed: boolean;
  canHide?: boolean;
  onGrow: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onHideColumn?: (id: string) => void;
  onOpen: (issue: IssueItem) => void;
  onQuickAction: (key: string, action: QuickAction) => void;
  assignees: string[];
  registerRef: (key: string, el: HTMLElement | null) => void;
  focusKey: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const text = statusText(category);
  const hasMore = items.length < total;

  useEffect(() => {
    onOverChange(isOver);
    // onOverChange is a stable setState callback from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver]);

  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-1.5 py-1">
        <button
          onClick={() => onToggleCollapse(id)}
          title={`Mở rộng cột ${label}`}
          aria-label={`Mở rộng cột ${label}`}
          className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-1 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
          <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">{total}</span>
          <span
            className="text-[10px] font-semibold tracking-tight"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {label}
          </span>
          <Maximize2 className="mt-1 h-3 w-3 text-muted-foreground" aria-hidden />
        </button>
        {canHide && onHideColumn && (
          <button
            onClick={() => onHideColumn(id)}
            title={`Ẩn hoàn toàn cột ${label}`}
            aria-label={`Ẩn hoàn toàn cột ${label}`}
            className="cursor-pointer rounded p-1 text-muted-foreground/60 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
          >
            <EyeOff className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-64 flex-1 basis-72 flex-col">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotColor)} />
        <span className={cn("min-w-0 truncate text-[13px] font-semibold tracking-tight", text)} title={label}>
          {label}
        </span>
        {wipOver && (
          <span
            className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400"
            title="Nhiều task đang chạy hơn mức khuyến nghị (WIP)"
          >
            WIP
          </span>
        )}
        {dragBlocked ? (
          <span className="ml-auto shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
            Không cho
          </span>
        ) : (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {total}
          </span>
        )}

        {/* Dropdown Menu actions for Column: Ẩn cột, Thu gọn cột */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={`Tùy chọn cột ${label}`}
              aria-label={`Tùy chọn cột ${label}`}
              className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {canHide && onHideColumn && (
              <DropdownMenuItem
                onClick={() => onHideColumn(id)}
                className="cursor-pointer gap-2 text-xs text-rose-600 focus:text-rose-600 dark:text-rose-400"
              >
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                <span>Ẩn cột này</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onToggleCollapse(id)}
              className="cursor-pointer gap-2 text-xs"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              <span>Thu gọn cột</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={() => onToggleCollapse(id)}
          title={`Thu gọn cột ${label}`}
          aria-label={`Thu gọn cột ${label}`}
          className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex flex-1 flex-col overflow-hidden rounded-xl border transition-colors duration-150",
          dragBlocked
            ? "border-rose-400/50 bg-rose-500/10"
            : isOver
              ? "border-primary/40 bg-primary/10"
              : "border-border/60 bg-muted/25"
        )}
      >
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-80", dragBlocked ? "bg-rose-400" : dotColor)} aria-hidden />
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 [scrollbar-width:thin]">
          {items.length === 0 ? (
            <div
              className={cn(
                "flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-8 text-center text-[11px] transition-colors",
                isOver ? "border-primary/50 bg-primary/5 text-primary" : "border-border/70 text-muted-foreground/70"
              )}
            >
              {isOver ? "Thả task vào đây" : emptyMessage || (isBacklog ? "Không có task Backlog" : "Không có task")}
            </div>
          ) : (
            <>
              {items.map((issue) => {
                const pending = optimistic.has(issue.jiraKey);
                const shown = pending
                  ? ({ ...issue, status: optimistic.get(issue.jiraKey)! } as IssueItem)
                  : issue;
                return (
                  <div key={issue.jiraKey} className="relative">
                    {pending && (
                      <span
                        className="absolute right-1.5 top-1.5 z-10 h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
                        title="Đang cập nhật Jira…"
                        aria-label="Đang cập nhật Jira"
                      />
                    )}
                    <DraggableCard
                      issue={shown}
                      done={isDone}
                      colIndex={colIndex}
                      columnCount={columnCount}
                      onTransition={onTransition}
                      busy={busy}
                      dndDisabled={dndDisabled}
                      showNavButtons
                      onOpen={() => onOpen(shown)}
                      onQuickAction={onQuickAction}
                      assignees={assignees}
                      registerRef={registerRef}
                      focused={focusKey === issue.jiraKey}
                    />
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => onGrow(id)}
                  className="cursor-pointer rounded-lg border border-dashed border-border/70 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                >
                  Xem thêm {total - items.length}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function BoardSkeleton({ columnCount }: { columnCount: number }) {
  const count = Math.max(3, Math.min(columnCount, 6));
  return (
    <div className="flex flex-1 gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, g) => (
        <div key={g} className="flex min-w-64 flex-1 basis-64 flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Card key={row} className="p-2.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-24" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
