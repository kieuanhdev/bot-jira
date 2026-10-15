"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import type { IssueItem } from "@/hooks/use-issues";
import { BoardColumn as BoardColumnComponent } from "./board-column";
import { CardContent } from "./board-card";
import type { BoardColumn, buildColumnViews } from "./lib/board-columns";
import type { QuickAction, Transition } from "./lib/board-types";
import { useBoardDnD } from "./lib/board-dnd-hook";

export interface BoardKanbanViewProps {
  boardScrollRef: React.RefObject<HTMLDivElement | null>;
  issues: IssueItem[];
  columns: BoardColumn[];
  statusCategoryMap: Record<string, string>;
  transitionCache: React.MutableRefObject<Map<string, Transition[]>>;
  fetchTransitions: (key: string) => Promise<Transition[]>;
  findColumnForIssue: (issue: IssueItem) => string;
  boardColumnsRender: ReturnType<typeof buildColumnViews>;
  transitionBusy: boolean;
  dndDisabled?: boolean;
  optimistic: Map<string, string>;
  visibleColumnsLength: number;
  growColumn: (colId: string) => void;
  toggleCollapse: (colId: string) => void;
  hideColumn: (colId: string) => void;
  onOpen: (issue: IssueItem) => void;
  onQuickAction: (key: string, action: QuickAction) => void;
  onTransition: (key: string, target: string) => void;
  assignees: string[];
  registerRef: (key: string, el: HTMLElement | null) => void;
  focusKey: string | null;
}

export function BoardKanbanView({
  boardScrollRef,
  issues,
  columns,
  statusCategoryMap,
  transitionCache,
  fetchTransitions,
  findColumnForIssue,
  boardColumnsRender,
  transitionBusy,
  dndDisabled: externalDndDisabled = false,
  optimistic,
  visibleColumnsLength,
  growColumn,
  toggleCollapse,
  hideColumn,
  onOpen,
  onQuickAction,
  onTransition,
  assignees,
  registerRef,
  focusKey,
}: BoardKanbanViewProps) {
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  useEffect(() => {
    if (selectedKeys.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKeys, clearSelection]);

  // Rubber-band selection: drag on empty board space to select every card the box touches.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const onBoardPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || externalDndDisabled) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-issue-key],button,a,input,[role=button],[role=menuitem]")) return;
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      const base: ReadonlySet<string> = additive ? selectedKeys : new Set();
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;

      const onMove = (ev: PointerEvent) => {
        if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
        active = true;
        const box = {
          left: Math.min(startX, ev.clientX),
          right: Math.max(startX, ev.clientX),
          top: Math.min(startY, ev.clientY),
          bottom: Math.max(startY, ev.clientY),
        };
        setMarquee({ x1: startX, y1: startY, x2: ev.clientX, y2: ev.clientY });
        const next = new Set(base);
        document.querySelectorAll<HTMLElement>("[data-issue-key]").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom) return;
          // Skip cards clipped out of view by their column's own scroll area.
          const clip = el.closest<HTMLElement>(".overflow-y-auto")?.getBoundingClientRect();
          if (clip && (r.bottom < clip.top || r.top > clip.bottom)) return;
          const key = el.dataset.issueKey;
          if (key) next.add(key);
        });
        setSelectedKeys(next);
      };
      const end = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        setMarquee(null);
        if (!active && !additive) clearSelection();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [externalDndDisabled, selectedKeys, clearSelection]
  );

  // Drop keys that left the board (filtered out / moved away after refetch).
  const [prevIssues, setPrevIssues] = useState(issues);
  if (prevIssues !== issues) {
    setPrevIssues(issues);
    if (selectedKeys.size > 0) {
      const present = new Set(issues.map((i) => i.jiraKey));
      const next = new Set([...selectedKeys].filter((k) => present.has(k)));
      if (next.size !== selectedKeys.size) {
        setSelectedKeys(next);
      }
    }
  }

  const dnd = useBoardDnD({
    boardScrollRef,
    issues,
    columns,
    statusCategoryMap,
    transitionCache,
    fetchTransitions,
    findColumnForIssue,
    onTransition,
    selectedKeys,
    onDropComplete: clearSelection,
  });

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      onDragStart={(e) => dnd.onDragStart(String(e.active.id))}
      onDragOver={dnd.onDragOver}
      onDragEnd={dnd.onDragEnd}
      onDragCancel={dnd.onDragCancel}
    >
      <div
        ref={boardScrollRef}
        onPointerDown={onBoardPointerDown}
        className="flex select-none h-[calc(100dvh-15rem)] min-h-[24rem] flex-none gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
      >
        {boardColumnsRender.map((col) => (
          <BoardColumnComponent
            key={col.id}
            id={col.id}
            label={col.label}
            category={col.category}
            isDone={col.isDone}
            isBacklog={col.isBacklog}
            emptyMessage={col.emptyMessage}
            items={col.items}
            colIndex={col.colIndex}
            columnCount={col.columnCount}
            onTransition={onTransition}
            busy={transitionBusy}
            dndDisabled={externalDndDisabled}
            onOverChange={dnd.setDragOverCol}
            dotColor={col.dotColor}
            dragBlocked={dnd.allowedCols != null && !dnd.allowedCols.has(col.id)}
            optimistic={optimistic}
            wipOver={col.wipOver}
            collapsed={col.collapsed}
            canHide={visibleColumnsLength > 1}
            total={col.total}
            onGrow={growColumn}
            onToggleCollapse={toggleCollapse}
            onHideColumn={hideColumn}
            onOpen={onOpen}
            onQuickAction={onQuickAction}
            assignees={assignees}
            registerRef={registerRef}
            focusKey={focusKey}
            selectedKeys={selectedKeys}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
      {marquee && (
        <div
          className="pointer-events-none fixed z-40 rounded-sm border border-primary bg-primary/15"
          style={{
            left: Math.min(marquee.x1, marquee.x2),
            top: Math.min(marquee.y1, marquee.y2),
            width: Math.abs(marquee.x2 - marquee.x1),
            height: Math.abs(marquee.y2 - marquee.y1),
          }}
          aria-hidden
        />
      )}
      {selectedKeys.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm shadow-lg">
          <span>
            Đã chọn <strong className="tabular-nums">{selectedKeys.size}</strong> task · kéo một thẻ đã chọn để chuyển tất cả
          </span>
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Bỏ chọn
          </button>
        </div>
      )}
      <DragOverlay>
        {dnd.activeDrag ? (
          <div className="relative">
            <CardContent issue={dnd.activeDrag} done={false} dragging />
            {selectedKeys.size > 1 && selectedKeys.has(dnd.activeDrag.jiraKey) && (
              <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground shadow">
                {selectedKeys.size}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
