"use client";

import React from "react";
import {
  DndContext,
  DragOverlay,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core";
import type { IssueItem } from "@/hooks/use-issues";
import { BoardColumn } from "./board-column";
import { CardContent } from "./board-card";
import type { buildColumnViews } from "./lib/board-columns";
import type { QuickAction } from "./lib/board-types";

export interface BoardKanbanViewProps {
  boardScrollRef: React.RefObject<HTMLDivElement | null>;
  sensors: SensorDescriptor<SensorOptions>[];
  collisionDetection: CollisionDetection;
  onDragStart: (key: string) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
  activeDrag: IssueItem | null;
  boardColumnsRender: ReturnType<typeof buildColumnViews>;
  transitionBusy: boolean;
  dndDisabled: boolean;
  setDragOverCol: (over: boolean) => void;
  allowedCols: Set<string> | null;
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
  sensors,
  collisionDetection,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
  activeDrag,
  boardColumnsRender,
  transitionBusy,
  dndDisabled,
  setDragOverCol,
  allowedCols,
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
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e) => onDragStart(String(e.active.id))}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        ref={boardScrollRef}
        className="flex flex-1 gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
      >
        {boardColumnsRender.map((col) => (
          <BoardColumn
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
            dndDisabled={dndDisabled}
            onOverChange={setDragOverCol}
            dotColor={col.dotColor}
            dragBlocked={allowedCols != null && !allowedCols.has(col.id)}
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
        {activeDrag ? (
          <CardContent issue={activeDrag} done={false} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
