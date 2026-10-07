import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, freshnessKeys } from "@/lib/query-keys";
import type { BoardWidth } from "@/lib/status-groups";
import type { BoardColumn } from "./board-columns";
import { loadStoredColumnPreferences, saveStoredColumnPreferences } from "./board-storage";
import type { BoardSyncState, Transition } from "./board-types";
import { useActiveSync } from "@/hooks/use-active-sync";

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

/** Queue a Jira sync for the selected project and poll its status until it settles. */
export function useJiraSync(selectedProject: string, setToast: (message: string | null) => void) {
  const qc = useQueryClient();
  const { isTargetSyncing } = useActiveSync(selectedProject);
  const [boardSync, setBoardSync] = useState<{
    projectKey: string;
    state: BoardSyncState;
    acceptedAt?: string;
    pollStartMs?: number;
  }>({
    projectKey: "",
    state: "idle",
  });

  const effectiveBoardSync = useMemo(() => {
    if (boardSync.state !== "idle") return boardSync;
    if (isTargetSyncing && selectedProject) {
      return {
        projectKey: selectedProject,
        state: "running" as BoardSyncState,
      };
    }
    return boardSync;
  }, [boardSync, isTargetSyncing, selectedProject]);

  const isCurrentProjectSyncing =
    (effectiveBoardSync.projectKey === selectedProject &&
      (effectiveBoardSync.state === "enqueueing" ||
        effectiveBoardSync.state === "queued" ||
        effectiveBoardSync.state === "running")) ||
    isTargetSyncing;

  useEffect(() => {
    if (boardSync.state !== "queued" && boardSync.state !== "running") return;
    const { projectKey, acceptedAt, pollStartMs = Date.now() } = boardSync;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function checkStatus() {
      const elapsed = Date.now() - pollStartMs;
      if (elapsed > 60_000) {
        if (!cancelled) {
          setToast("Chưa nhận được trạng thái đồng bộ. Hãy kiểm tra worker hoặc thử lại.");
          setBoardSync({ projectKey: "", state: "idle" });
        }
        return;
      }

      try {
        const queryParams = new URLSearchParams({ projectKey });
        if (acceptedAt) queryParams.set("since", acceptedAt);
        const res = await api<{
          projectKey: string;
          state: "queued" | "running" | "succeeded" | "failed" | "unknown";
          lastError: string | null;
        }>(`/api/sync/jira/status?${queryParams.toString()}`);

        if (cancelled) return;

        if (res.state === "succeeded") {
          void qc.invalidateQueries({ queryKey: issuesKeys.all });
          void qc.invalidateQueries({ queryKey: boardKeys.projects });
          void qc.invalidateQueries({ queryKey: freshnessKeys.all });
          setToast(`Đã đồng bộ ${projectKey}.`);
          setBoardSync({ projectKey, state: "succeeded" });
          setTimeout(() => {
            if (!cancelled) setBoardSync({ projectKey: "", state: "idle" });
          }, 2000);
          return;
        }

        if (res.state === "failed") {
          const shortErr = res.lastError ? res.lastError.slice(0, 100) : "Lỗi đồng bộ";
          setToast(`Không thể đồng bộ ${projectKey}: ${shortErr}`);
          setBoardSync({ projectKey, state: "failed" });
          setTimeout(() => {
            if (!cancelled) setBoardSync({ projectKey: "", state: "idle" });
          }, 3500);
          return;
        }

        if (res.state === "running" && boardSync.state !== "running") {
          setBoardSync((prev) => (prev.projectKey === projectKey ? { ...prev, state: "running" } : prev));
        }

        const nextDelay = elapsed < 15_000 ? 1000 : 2500;
        timer = setTimeout(checkStatus, nextDelay);
      } catch {
        if (!cancelled) {
          timer = setTimeout(checkStatus, 2500);
        }
      }
    }

    timer = setTimeout(checkStatus, 800);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [boardSync, qc, setToast]);

  const syncJira = async () => {
    if (!selectedProject || isCurrentProjectSyncing) return;
    const targetProject = selectedProject;
    setBoardSync({ projectKey: targetProject, state: "enqueueing" });
    setToast(`Đang gửi yêu cầu đồng bộ ${targetProject}…`);

    try {
      const res = await api<{
        state: "queued" | "already_running";
        acceptedAt: string;
      }>("/api/sync/jira", {
        method: "POST",
        body: { projectKey: targetProject },
      });

      if (res.state === "already_running") {
        setToast(`${targetProject} đang được đồng bộ. Dữ liệu sẽ tự cập nhật khi hoàn tất.`);
      } else {
        setToast(`${targetProject} đang chờ đồng bộ.`);
      }

      setBoardSync({
        projectKey: targetProject,
        state: "queued",
        acceptedAt: res.acceptedAt || new Date().toISOString(),
        pollStartMs: Date.now(),
      });
    } catch (error) {
      setToast(`Không thể đồng bộ ${targetProject}: ${(error as Error).message.slice(0, 100)}`);
      setBoardSync({ projectKey: "", state: "idle" });
    }
  };

  return { boardSync: effectiveBoardSync, isCurrentProjectSyncing, syncJira };
}

/** Per-issue Jira transitions: cached, de-duplicated, and prefetched for every loaded issue. */
export function useTransitionCache(issues: IssueItem[]) {
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

  const transitionKeys = useMemo(() => issues.map((i) => i.jiraKey).join("|"), [issues]);
  useEffect(() => {
    const keys = transitionKeys ? transitionKeys.split("|") : [];
    let cancelled = false;
    void (async () => {
      for (const key of keys) {
        if (cancelled) return;
        if (transitionCache.current.has(key)) continue;
        try {
          await fetchTransitions(key);
        } catch {
          // Leave it uncached; drag-start and transition execution retry it.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transitionKeys, fetchTransitions]);

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
