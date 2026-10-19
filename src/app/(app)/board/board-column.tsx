"use client";

import { memo, useEffect } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronRight, EyeOff, Maximize2, Minimize2, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export const BoardColumn = memo(function BoardColumn({
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
  selectedKeys,
  onToggleSelect,
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
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const text = statusText(category);
  const hasMore = items.length < total;

  useEffect(() => {
    onOverChange(isOver);
  }, [isOver, onOverChange]);

  if (collapsed) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center gap-1.5 py-1">
        <button
          onClick={() => onToggleCollapse(id)}
          title={`Mở rộng cột ${label}`}
          aria-label={`Mở rộng cột ${label}`}
          className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-muted/60 px-1 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary-soft/50"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", dotColor)} />
          <Badge variant="neutral" className="px-1 py-0 text-2xs font-semibold tabular-nums">
            {total}
          </Badge>
          <span
            className="text-2xs font-semibold tracking-tight"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            {label}
          </span>
          <Maximize2 className="mt-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </button>
        {canHide && onHideColumn && (
          <button
            onClick={() => onHideColumn(id)}
            title={`Ẩn hoàn toàn cột ${label}`}
            aria-label={`Ẩn hoàn toàn cột ${label}`}
            className="cursor-pointer rounded p-1 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <EyeOff className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-64 flex-1 basis-72 flex-col">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotColor)} />
        <span className={cn("min-w-0 truncate text-sm font-semibold tracking-tight", text)} title={label}>
          {label}
        </span>
        {wipOver && (
          <Badge
            variant="warning"
            title="Nhiều task đang chạy hơn mức khuyến nghị (WIP)"
          >
            WIP
          </Badge>
        )}
        {dragBlocked ? (
          <Badge variant="danger" className="ml-auto">
            Không cho
          </Badge>
        ) : (
          <Badge variant="neutral" className="ml-auto tabular-nums font-semibold">
            {total}
          </Badge>
        )}

        {/* Dropdown Menu actions for Column: Ẩn cột, Thu gọn cột */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              title={`Tùy chọn cột ${label}`}
              aria-label={`Tùy chọn cột ${label}`}
              className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {canHide && onHideColumn && (
              <DropdownMenuItem
                onClick={() => onHideColumn(id)}
                className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
              >
                <EyeOff className="h-4 w-4" aria-hidden />
                <span>Ẩn cột này</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onToggleCollapse(id)}
              className="cursor-pointer gap-2 text-xs"
            >
              <Minimize2 className="h-4 w-4" aria-hidden />
              <span>Thu gọn cột</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          onClick={() => onToggleCollapse(id)}
          title={`Thu gọn cột ${label}`}
          aria-label={`Thu gọn cột ${label}`}
          className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border transition-colors duration-150",
          dragBlocked
            ? "border-destructive/40 bg-destructive/10"
            : isOver
              ? "border-primary/40 bg-primary-soft/50 ring-1 ring-primary"
              : "border-border/60 bg-muted/60"
        )}
      >
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-80", dragBlocked ? "bg-destructive" : dotColor)} aria-hidden />
        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2.5 [scrollbar-width:thin]">
          {items.length === 0 ? (
            <div
              className={cn(
                "flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-8 text-center text-xs transition-colors",
                isOver ? "border-primary/50 bg-primary-soft/30 text-primary" : "border-border/70 text-muted-foreground"
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
                      onOpen={onOpen}
                      onQuickAction={onQuickAction}
                      assignees={assignees}
                      registerRef={registerRef}
                      focused={focusKey === issue.jiraKey}
                      selected={selectedKeys?.has(issue.jiraKey)}
                      onToggleSelect={onToggleSelect}
                    />
                  </div>
                );
              })}
              {hasMore && (
                <button
                  onClick={() => onGrow(id)}
                  className="cursor-pointer rounded-lg border border-dashed border-border/70 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft/30 hover:text-primary"
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
});

export { BoardSkeleton } from "./board-skeleton";
