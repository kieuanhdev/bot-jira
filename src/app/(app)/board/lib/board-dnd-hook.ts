"use client";

import { useMemo, useRef, useState } from "react";
import {
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import type { IssueItem } from "@/hooks/use-issues";
import type { BoardColumn } from "./board-columns";
import { allowedColumnKeys } from "./board-columns";
import type { Transition } from "./board-types";
import { useDragAutoScroll } from "./board-hooks";

interface BoardDnDOptions {
  boardScrollRef: React.RefObject<HTMLDivElement | null>;
  issues: IssueItem[];
  columns: BoardColumn[];
  statusCategoryMap: Record<string, string>;
  transitionCache: React.MutableRefObject<Map<string, Transition[]>>;
  fetchTransitions: (key: string) => Promise<Transition[]>;
  findColumnForIssue: (issue: IssueItem) => string;
  onTransition: (key: string, target: string) => void;
}

export function useBoardDnD({
  boardScrollRef,
  issues,
  columns,
  statusCategoryMap,
  transitionCache,
  fetchTransitions,
  findColumnForIssue,
  onTransition,
}: BoardDnDOptions) {
  const issueByKey = useMemo(() => new Map(issues.map((i) => [i.jiraKey, i])), [issues]);
  const [activeDrag, setActiveDrag] = useState<IssueItem | null>(null);
  const activeDragKeyRef = useRef<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState(false);
  const [allowedCols, setAllowedCols] = useState<Set<string> | null>(null);

  useDragAutoScroll(boardScrollRef, activeDrag, dragOverCol);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  function onDragStart(key: string) {
    const issue = issueByKey.get(key) ?? null;
    activeDragKeyRef.current = issue?.jiraKey ?? null;
    setActiveDrag(issue);
    setAllowedCols(null);
    if (!issue) return;

    void fetchTransitions(issue.jiraKey)
      .then((all) => {
        if (activeDragKeyRef.current !== issue.jiraKey) return;
        const currentCol = findColumnForIssue(issue);
        setAllowedCols(allowedColumnKeys(columns, statusCategoryMap, currentCol, all));
      })
      .catch(() => {
        // `handleTransition` reports the actionable error if the user drops.
      });
  }

  function onDragOver(event: DragOverEvent) {
    const activeId = String(event.active.id);
    const activeKey = activeId.replace(/^card:/, "");
    const source = issueByKey.get(activeKey);
    if (!source) {
      setAllowedCols(null);
      return;
    }
    const all = transitionCache.current.get(activeKey);
    if (!all) return; // still loading; onDragStart sets allowedCols when it resolves
    const currentCol = findColumnForIssue(source);
    const next = allowedColumnKeys(columns, statusCategoryMap, currentCol, all);
    setAllowedCols((prev) =>
      prev && prev.size === next.size && [...next].every((k) => prev.has(k)) ? prev : next
    );
  }

  function onDragEnd(event: DragEndEvent) {
    activeDragKeyRef.current = null;
    setAllowedCols(null);
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const key = String(active.id);
    const targetColumn = String(over.id);
    const source = issueByKey.get(key);
    if (!source) return;
    const currentCol = findColumnForIssue(source);
    if (currentCol === targetColumn) return;
    onTransition(key, targetColumn);
  }

  function onDragCancel() {
    activeDragKeyRef.current = null;
    setAllowedCols(null);
    setActiveDrag(null);
  }

  function collisionDetection(args: Parameters<CollisionDetection>[0]): ReturnType<CollisionDetection> {
    const ranked = closestCorners(args);
    const activeKey = String(args.active.id).replace(/^card:/, "");
    const source = issueByKey.get(activeKey);
    if (!source) return [];
    const currentCol = findColumnForIssue(source);
    const all = transitionCache.current.get(activeKey);
    // Transitions not loaded yet: don't block the drop; handleTransition validates it.
    if (!all) return ranked.length > 0 ? [ranked[0]] : [];
    const allowed = allowedColumnKeys(columns, statusCategoryMap, currentCol, all);
    const first = ranked.find((r) => allowed.has(String(r.id)));
    return first ? [first] : [];
  }

  return {
    sensors,
    activeDrag,
    allowedCols,
    dragOverCol,
    setDragOverCol,
    collisionDetection,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  };
}
