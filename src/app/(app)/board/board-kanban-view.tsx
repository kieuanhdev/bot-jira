"use client";

import React from "react";
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
  const dnd = useBoardDnD({
    boardScrollRef,
    issues,
    columns,
    statusCategoryMap,
    transitionCache,
    fetchTransitions,
    findColumnForIssue,
    onTransition,
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
        className="flex h-[calc(100dvh-15rem)] min-h-[24rem] flex-none gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
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
          />
        ))}
      </div>
      <DragOverlay>
        {dnd.activeDrag ? (
          <CardContent issue={dnd.activeDrag} done={false} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
