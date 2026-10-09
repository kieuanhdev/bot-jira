import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api } from "@/lib/api-client";
import type { IssueItem } from "@/hooks/use-issues";
import type { BoardWidth } from "@/lib/status-groups";
import type { BoardColumn } from "./board-columns";
import { loadStoredColumnPreferences, saveStoredColumnPreferences } from "./board-storage";
import type { Transition } from "./board-types";

/** Viewport bucket used to pick the default view (narrow screens fall back to the list). */
export function useBoardWidth(): BoardWidth {
  const [width, setWidth] = useState<BoardWidth>("wide");
  useEffect(() => {
    function measure() {
      const w = window.innerWidth;
      setWidth(w >= 1280 ? "wide" : w >= 768 ? "medium" : "narrow");
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return width;
}

/**
 * While a card is dragged over a column, auto-scroll the board horizontally
 * so off-screen columns can be reached and dropped on.
 */
export function useDragAutoScroll(
  boardScrollRef: RefObject<HTMLDivElement | null>,
  activeDrag: IssueItem | null,
  dragOverCol: boolean
) {
  useEffect(() => {
    if (!activeDrag || !dragOverCol) return;
    let raf = 0;
    const tick = () => {
      const el = boardScrollRef.current;
      if (el) {
        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        if (el.scrollLeft <= 1) el.scrollLeft += 16;
        else if (atEnd) el.scrollLeft -= 16;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boardScrollRef, activeDrag, dragOverCol]);
}

/** Per-issue Jira transitions: cached and de-duplicated, fetched lazily (drag start / action), never in bulk. */
export function useTransitionCache() {
  const transitionCache = useRef(new Map<string, Transition[]>());
  const transitionRequests = useRef(new Map<string, Promise<Transition[]>>());

  const fetchTransitions = useCallback(async (key: string) => {
    if (transitionCache.current.has(key)) {
      return transitionCache.current.get(key)!;
    }
    if (transitionRequests.current.has(key)) {
      return transitionRequests.current.get(key)!;
    }
    const request = api<{ transitions: Transition[] }>(`/api/issues/${key}/transitions`)
      .then((result) => {
        transitionCache.current.set(key, result.transitions);
        return result.transitions;
      })
      .finally(() => transitionRequests.current.delete(key));
    transitionRequests.current.set(key, request);
    return request;
  }, []);

  function invalidateTransitionCache(key: string) {
    transitionCache.current.delete(key);
    transitionRequests.current.delete(key);
  }

  return { transitionCache, fetchTransitions, invalidateTransitionCache };
}

/** Per-project hidden/collapsed board columns, persisted to localStorage. */
export function useColumnPreferences(
  selectedProject: string,
  columns: BoardColumn[],
  byColumn: Map<string, IssueItem[]>
) {
  const [columnPrefs, setColumnPrefs] = useState<{
    projectKey: string;
    hidden: Set<string>;
    collapsed: Set<string>;
  }>({ projectKey: "", hidden: new Set(), collapsed: new Set() });

  const activeColumnPrefs = useMemo(() => {
    if (columnPrefs.projectKey === selectedProject) return columnPrefs;
    const stored = loadStoredColumnPreferences(selectedProject);
    return {
      projectKey: selectedProject,
      hidden: new Set(stored.hidden),
      collapsed: new Set(stored.collapsed),
    };
  }, [columnPrefs, selectedProject]);

  const hiddenCols = activeColumnPrefs.hidden;
  const collapsedCols = activeColumnPrefs.collapsed;

  function persistColumnPrefs(hidden: Set<string>, collapsed: Set<string>) {
    setColumnPrefs({ projectKey: selectedProject, hidden, collapsed });
    saveStoredColumnPreferences(selectedProject, { hidden: [...hidden], collapsed: [...collapsed] });
  }

  const visibleColumns = useMemo(() => {
    const visible = columns.filter((column) => !hiddenCols.has(column.key));
    return visible.length > 0 ? visible : columns;
  }, [columns, hiddenCols]);

  function toggleCollapse(colId: string) {
    const next = new Set(collapsedCols);
    if (next.has(colId)) next.delete(colId);
    else next.add(colId);
    persistColumnPrefs(new Set(hiddenCols), next);
  }

  function hideColumn(colId: string) {
    if (visibleColumns.length <= 1) return;
    const next = new Set(hiddenCols);
    next.add(colId);
    persistColumnPrefs(next, new Set(collapsedCols));
  }

  function showColumn(colId: string) {
    const next = new Set(hiddenCols);
    next.delete(colId);
    persistColumnPrefs(next, new Set(collapsedCols));
  }

  function showAllColumns() {
    persistColumnPrefs(new Set(), new Set(collapsedCols));
  }

  function toggleColumnVisibility(colId: string) {
    const next = new Set(hiddenCols);
    if (next.has(colId)) next.delete(colId);
    else {
      if (visibleColumns.length <= 1) return;
      next.add(colId);
    }
    persistColumnPrefs(next, new Set(collapsedCols));
  }

  function hideEmptyColumns() {
    const next = new Set(hiddenCols);
    for (const column of columns) {
      if ((byColumn.get(column.key)?.length ?? 0) === 0) {
        next.add(column.key);
      }
    }
    if (next.size >= columns.length) {
      next.delete(columns[0].key);
    }
    persistColumnPrefs(next, new Set(collapsedCols));
  }

  function collapseEmptyColumns() {
    const next = new Set(collapsedCols);
    for (const column of visibleColumns) {
      if ((byColumn.get(column.key)?.length ?? 0) === 0) next.add(column.key);
    }
    persistColumnPrefs(new Set(hiddenCols), next);
  }

  function expandAllCollapsedColumns() {
    persistColumnPrefs(new Set(hiddenCols), new Set());
  }

  function resetColumnPreferences() {
    persistColumnPrefs(new Set(), new Set());
  }

  return {
    hiddenCols,
    collapsedCols,
    visibleColumns,
    toggleCollapse,
    hideColumn,
    showColumn,
    showAllColumns,
    toggleColumnVisibility,
    hideEmptyColumns,
    collapseEmptyColumns,
    expandAllCollapsedColumns,
    resetColumnPreferences,
  };
}
