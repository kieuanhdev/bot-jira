"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  useIssues,
  fetchIssuesPage,
  type IssueItem,
  type IssueSuccessResponse,
} from "@/hooks/use-issues";
import { issuesKeys, boardKeys, meKeys } from "@/lib/query-keys";
import {
  type IssueFilters,
  DEFAULT_BOARD_FILTERS,
  effectiveAssignees,
  countActiveIssueFilters,
  parseIssueFilters,
  serializeIssueFilters,
} from "@/lib/issues/issue-filters";
import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import {
  loadStoredFilters,
  loadStoredProject,
  loadStoredSortMode,
  loadStoredViewMode,
  saveStoredFilters,
  saveStoredProject,
  saveStoredSortMode,
  saveStoredViewMode,
} from "./lib/board-storage";
import { Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { BoardSummaryCards } from "./board-summary-cards";
import { BoardSkeleton } from "./board-column";
import { QuickPanel } from "./board-quick-panel";
import {
  type Project,
  type SortMode,
  type ViewMode,
} from "./lib/board-types";
import { sortIssues, columnKeyForIssue } from "./lib/board-utils";
import { BoardProjectSummaryLine, HiddenColumnsBanner, StaleSyncBanner } from "./board-banners";
import { BoardNoProjectsState } from "./board-empty-projects";
import { BoardListView } from "./board-list-view";
import { BoardHeader } from "./board-header";
import { BoardKanbanView } from "./board-kanban-view";
import { useBoardKeyboardNav } from "./lib/board-keyboard-nav";
import { useBoardActions } from "./lib/board-actions-hook";
import { useBoardDnD } from "./lib/board-dnd-hook";
import {
  COL_BATCH,
  buildColumns,
  buildColumnViews,
  indexColumnsByStatus,
  indexColumnsByStatusId,
  summarizeBoard,
  type BoardStatusesResponse,
} from "./lib/board-columns";
import {
  useBoardWidth,
  useColumnPreferences,
  useJiraSync,
  useTransitionCache,
} from "./lib/board-hooks";

export function BoardClient() {
  const qc = useQueryClient();
  const router = useRouter();
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const { data: projects } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Project[] }>("/api/projects"),
    refetchInterval: 30000,
    retry: 0,
  });
  const allProjects = useMemo(() => projects?.items ?? [], [projects?.items]);

  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () =>
      api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    retry: 0,
  });
  const myName = meStatus?.jiraName ?? null;
  const jiraBaseUrl = meStatus?.jiraBaseUrl ?? "";

  const { data: prefs } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    retry: 0,
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[] | null>(null);

  const preferred = useMemo(() => prefs?.projects ?? [], [prefs?.projects]);
  const availableKeys = useMemo(() => prefs?.available ?? [], [prefs?.available]);

  const searchParams = useSearchParams();
  const urlProject = searchParams?.get("project")?.trim().toUpperCase() || "";
  const hasFilterParamsInUrl = Boolean(
    searchParams &&
      Array.from(searchParams.keys()).some((k) => k !== "project")
  );

  const [project, setProject] = useState<string>(() => {
    if (urlProject) return urlProject;
    return loadStoredProject() || "";
  });
  const [boardNewKey, setBoardNewKey] = useState("");
  const [boardValidating, setBoardValidating] = useState(false);
  const [boardValidateError, setBoardValidateError] = useState<string | null>(null);

  const savePrefs = useCallback(async (next: string[]) => {
    await api("/api/me/preferences", { method: "PUT", body: { projects: next } });
    await Promise.all([
      qc.invalidateQueries({ queryKey: meKeys.prefs }),
      qc.invalidateQueries({ queryKey: boardKeys.projects }),
    ]);
    setProject((prev) => (next.length > 0 && (!prev || !next.includes(prev)) ? next[0] : prev));
  }, [qc]);

  const effectivePreferred = useMemo(
    () => (preferred.length === 0 ? availableKeys : preferred),
    [preferred, availableKeys]
  );

  const selectedProject = effectivePreferred.includes(project)
    ? project
    : (effectivePreferred[0] ?? "");

  const countMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allProjects) m.set(p.key, p.openCount);
    return m;
  }, [allProjects]);
  const projectList = useMemo(
    () =>
      effectivePreferred
        .filter((k) => availableKeys.includes(k) || effectivePreferred.includes(k))
        .map((k) => ({ key: k, openCount: countMap.get(k) ?? 0 })),
    [effectivePreferred, countMap, availableKeys]
  );

  const pickerActive = pickerSelection ?? effectivePreferred;
  const pickerSet = new Set(pickerActive);

  function openPicker() {
    setPickerSelection(effectivePreferred);
    setBoardValidateError(null);
    setShowPicker(true);
  }

  function closePicker() {
    setShowPicker(false);
    setPickerSelection(null);
    setBoardValidateError(null);
  }

  function commitPicker() {
    if (pickerSelection) savePrefs(pickerSelection);
    closePicker();
  }

  function togglePicker(key: string) {
    setPickerSelection((prev) => {
      const base = prev ?? effectivePreferred;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  }

  function handleSelectProject(nextKey: string) {
    if (nextKey === selectedProject) return;
    if (selectedProject) {
      saveStoredFilters(selectedProject, filters);
    }
    setProject(nextKey);
    saveStoredProject(nextKey);
    const saved = loadStoredFilters(nextKey, myName);
    if (saved) {
      setFilters(saved);
    } else {
      setFilters({
        ...DEFAULT_BOARD_FILTERS,
        project: nextKey,
      });
    }
  }

  async function handleAddProjectToBoard() {
    const key = boardNewKey.trim().toUpperCase();
    if (!key) return;
    setBoardValidating(true);
    setBoardValidateError(null);
    try {
      const res = await api<{
        ok: boolean;
        error?: string;
        created?: boolean;
        project?: { key: string; name: string };
        bootstrap?: { state: string };
      }>("/api/projects", { method: "POST", body: { key } });

      if (!res.ok || !res.project) {
        setBoardValidateError(res.error ?? "Dự án không tồn tại trên Jira.");
        return;
      }
      const verifiedKey = res.project.key;
      await Promise.all([
        qc.invalidateQueries({ queryKey: meKeys.prefs }),
        qc.invalidateQueries({ queryKey: boardKeys.projects }),
        qc.invalidateQueries({ queryKey: ["board", "statuses", verifiedKey] }),
      ]);
      setBoardNewKey("");
      closePicker();
      handleSelectProject(verifiedKey);
      setToast(`Đã thêm dự án ${res.project.name} (${verifiedKey}) và bắt đầu đồng bộ.`);
    } catch (err: unknown) {
      setBoardValidateError((err as Error).message || "Lỗi kiểm tra dự án trên Jira.");
    } finally {
      setBoardValidating(false);
    }
  }

  function handleBoardNewKeyChange(value: string) {
    setBoardNewKey(value.toUpperCase());
    setBoardValidateError(null);
  }

  const [view, setView] = useState<ViewMode>(() => {
    return loadStoredViewMode() ?? "board";
  });
  const [filters, setFilters] = useState<IssueFilters>(() => {
    if (searchParams && hasFilterParamsInUrl) {
      return parseIssueFilters(searchParams, DEFAULT_BOARD_FILTERS, myName);
    }
    const initialPrj = urlProject || loadStoredProject() || "";
    if (initialPrj) {
      const saved = loadStoredFilters(initialPrj, myName);
      if (saved) return saved;
    }
    return DEFAULT_BOARD_FILTERS;
  });

  // When selectedProject changes, ensure it is saved in storage
  useEffect(() => {
    if (selectedProject) {
      saveStoredProject(selectedProject);
    }
  }, [selectedProject]);

  // Initial sync when selectedProject resolves after async preferences load
  const initialSyncDoneRef = useRef(false);
  useEffect(() => {
    if (!initialSyncDoneRef.current && selectedProject && !hasFilterParamsInUrl) {
      initialSyncDoneRef.current = true;
      const saved = loadStoredFilters(selectedProject, myName);
      if (saved) {
        setFilters(saved);
      }
    }
  }, [selectedProject, myName, hasFilterParamsInUrl]);

  // Re-sync with myName if loaded subsequently
  const myNameSyncedRef = useRef(false);
  useEffect(() => {
    if (myName && !myNameSyncedRef.current) {
      myNameSyncedRef.current = true;
      setFilters((prev) => {
        if (hasFilterParamsInUrl && searchParams) {
          return parseIssueFilters(searchParams, prev, myName);
        }
        if (selectedProject) {
          const saved = loadStoredFilters(selectedProject, myName);
          if (saved) return saved;
        }
        return prev;
      });
    }
  }, [myName, searchParams, hasFilterParamsInUrl, selectedProject]);

  // Save filters to localStorage whenever filters or selectedProject change
  useEffect(() => {
    if (selectedProject) {
      saveStoredFilters(selectedProject, filters);
    }
  }, [filters, selectedProject]);

  // Sync URL when filters change (debounced for search text)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const filtersWithProject: IssueFilters = {
        ...filters,
        project: selectedProject,
      };
      const sp = serializeIssueFilters(filtersWithProject, DEFAULT_BOARD_FILTERS);
      if (selectedProject) {
        sp.set("project", selectedProject);
      }
      const qs = sp.toString();
      const currentUrl = window.location.pathname + (window.location.search || "");
      const targetUrl = window.location.pathname + (qs ? `?${qs}` : "");
      if (currentUrl !== targetUrl) {
        router.replace(targetUrl, { scroll: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [filters, selectedProject, router]);

  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return loadStoredSortMode() ?? "updated";
  });
  useEffect(() => {
    saveStoredSortMode(sortMode);
  }, [sortMode]);

  useEffect(() => {
    saveStoredViewMode(view);
  }, [view]);

  const [quickPanel, setQuickPanel] = useState<IssueItem | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const boardQueriesEnabled =
    effectivePreferred.length > 0 && Boolean(selectedProject);

  const activeFilterCount = countActiveIssueFilters(filters, DEFAULT_BOARD_FILTERS);

  const [colVisibleState, setColVisibleState] = useState<{ sig: string; counts: Record<string, number> }>({
    sig: "",
    counts: {},
  });

  const width = useBoardWidth();
  const effectiveView: ViewMode = width === "narrow" ? "list" : view;

  const activeAssignees = effectiveAssignees(filters.assigneeScope);
  const isAssigneeAll = activeAssignees === "ALL";
  const boardFilters: import("@/hooks/use-issues").BoardFilters = {
    ...(selectedProject ? { project: selectedProject } : {}),
    q: filters.query || undefined,
    label: filters.labels.length > 0 ? filters.labels : undefined,
    priority: filters.priorities.length > 0 ? filters.priorities : undefined,
    assignee: isAssigneeAll ? "ALL" : activeAssignees,
    includeDone: true,
    limit: 1000,
  };
  const { data, isLoading, isFetching } = useIssues(boardFilters, {
    enabled: boardQueriesEnabled,
  });

  const issueData: IssueSuccessResponse | null =
    data && "items" in data ? (data as IssueSuccessResponse) : null;

  const filterSig = JSON.stringify({
    p: selectedProject,
    q: filters.query,
    label: [...filters.labels].sort(),
    priority: [...filters.priorities].sort(),
    assignee: isAssigneeAll ? "ALL" : [...activeAssignees].sort(),
  });
  const [extraPages, setExtraPages] = useState<{ sig: string; items: IssueItem[] }>({ sig: "", items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedTotal = issueData?.total ?? 0;

  const extraIssues = useMemo(
    () => (extraPages.sig === filterSig ? extraPages.items : []),
    [extraPages, filterSig]
  );
  const firstPageCount = issueData?.items.length ?? 0;
  const hasMore = firstPageCount + extraIssues.length < loadedTotal;

  async function loadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const sig = filterSig;
    try {
      const offset = firstPageCount + extraIssues.length;
      const page = await fetchIssuesPage(boardFilters, offset, 1000);
      setExtraPages((prev) => {
        const base = prev.sig === sig ? prev.items : [];
        return { sig, items: [...base, ...page.items] };
      });
    } catch (e) {
      setToast(`Couldn't load more tasks: ${(e as Error).message.slice(0, 80)}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const issues: IssueItem[] = useMemo(
    () => (issueData ? [...issueData.items, ...extraIssues] : [...extraIssues]),
    [issueData, extraIssues]
  );

  const { boardSync, isCurrentProjectSyncing, syncJira } = useJiraSync(selectedProject, setToast);

  const { data: optData } = useQuery({
    queryKey: issuesKeys.filters(selectedProject),
    enabled: effectivePreferred.length > 0,
    queryFn: () =>
      api<{ assignees: string[]; labels: string[]; priorities: string[] }>(
        `/api/issues/filters?project=${selectedProject}`
      ),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const assignees = optData?.assignees ?? [];
  const labelOptions = optData?.labels ?? [];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (e.key === "Escape" && quickPanel) {
        setQuickPanel(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickPanel]);

  const { data: statusesData, isLoading: isLoadingStatuses } = useQuery({
    queryKey: boardKeys.statuses(selectedProject),
    enabled: boardQueriesEnabled,
    queryFn: () =>
      api<BoardStatusesResponse>(`/api/board/statuses?project=${selectedProject}`),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const statusCategoryMap = useMemo<Record<string, string>>(
    () => statusesData?.statusCategoryMap ?? {},
    [statusesData?.statusCategoryMap]
  );

  const columns = useMemo(
    () => buildColumns(statusesData, statusCategoryMap, issues),
    [statusesData, statusCategoryMap, issues]
  );

  const [optimistic, setOptimistic] = useState<Map<string, string>>(new Map());

  function setOptimisticStatus(key: string, status: string | null) {
    setOptimistic((prev) => {
      const next = new Map(prev);
      if (status === null) next.delete(key);
      else next.set(key, status);
      return next;
    });
  }

  const columnKeyByStatusId = useMemo(() => indexColumnsByStatusId(columns), [columns]);
  const columnKeyByStatus = useMemo(() => indexColumnsByStatus(columns), [columns]);

  function findColumnForIssue(issue: IssueItem): string {
    const effective = optimistic.has(issue.jiraKey)
      ? ({ ...issue, status: optimistic.get(issue.jiraKey)! } as IssueItem)
      : issue;
    return columnKeyForIssue(
      effective,
      columnKeyByStatus,
      statusCategoryMap,
      columns,
      columnKeyByStatusId
    );
  }

  const byColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const c of columns) m.set(c.key, []);
    for (const issue of issues) {
      const col = findColumnForIssue(issue);
      const bucket = m.get(col);
      if (bucket) bucket.push(issue);
    }
    return m;
    // findColumnForIssue closes over the same values listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, columns, columnKeyByStatus, statusCategoryMap, optimistic]);

  const sortedByColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const [k, v] of byColumn) m.set(k, sortIssues(v, sortMode));
    return m;
  }, [byColumn, sortMode]);

  const summary = useMemo(
    () => summarizeBoard(columns, byColumn, issues),
    [columns, byColumn, issues]
  );

  const activeProject = projectList.find((p) => p.key === selectedProject) ?? null;

  const {
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
  } = useColumnPreferences(selectedProject, columns, byColumn);

  const columnKeys = useMemo(() => visibleColumns.map((c) => c.key), [visibleColumns]);

  const { transitionCache, fetchTransitions, invalidateTransitionCache } = useTransitionCache(issues);

  const { transitionBusy, handleTransition, handleQuickAction } = useBoardActions({
    issues,
    columns,
    columnKeys,
    statusCategoryMap,
    jiraBaseUrl,
    fetchTransitions,
    invalidateTransitionCache,
    setOptimisticStatus,
    setToast,
    router,
    qc,
    findColumnForIssue,
  });

  const dnd = useBoardDnD({
    boardScrollRef,
    issues,
    columns,
    statusCategoryMap,
    transitionCache,
    fetchTransitions,
    findColumnForIssue,
    onTransition: handleTransition,
  });

  const colResetSig = useMemo(
    () => `${selectedProject}|${sortMode}|${filterSig}|${issues.length}`,
    [selectedProject, sortMode, filterSig, issues.length]
  );
  const colVisible = useMemo(
    () => (colVisibleState.sig === colResetSig ? colVisibleState.counts : {}),
    [colVisibleState, colResetSig]
  );

  const boardColumnsRender = useMemo(
    () => buildColumnViews(visibleColumns, sortedByColumn, colVisible, collapsedCols, activeFilterCount),
    [visibleColumns, sortedByColumn, colVisible, collapsedCols, activeFilterCount]
  );

  function growColumn(colId: string) {
    setColVisibleState((prev) => {
      const counts = prev.sig === colResetSig ? { ...prev.counts } : {};
      counts[colId] = (counts[colId] ?? COL_BATCH) + COL_BATCH;
      return { sig: colResetSig, counts };
    });
  }

  const [hiddenTableCols, setHiddenTableCols] = useState<Set<string>>(new Set());
  function toggleTableColumn(colKey: string) {
    setHiddenTableCols((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  }

  const focusOrder = useMemo(
    () =>
      boardColumnsRender
        .filter((c) => !c.collapsed)
        .flatMap((c) => c.items.map((i) => i.jiraKey)),
    [boardColumnsRender]
  );

  useBoardKeyboardNav({
    effectiveView,
    focusOrder,
    issues,
    cardRefs,
    focusKey,
    setFocusKey,
    onOpenQuickPanel: (issue) => setQuickPanel(issue),
  });

  if (effectivePreferred.length === 0) {
    return (
      <BoardNoProjectsState
        boardNewKey={boardNewKey}
        boardValidating={boardValidating}
        boardValidateError={boardValidateError}
        hasAvailableKeys={availableKeys.length > 0}
        onKeyChange={handleBoardNewKeyChange}
        onAddProject={handleAddProjectToBoard}
        onPickFromList={() => setShowPicker(true)}
      />
    );
  }

  const dndDisabled = effectiveView === "list" || transitionBusy;

  return (
    <div className="relative flex h-full flex-col gap-3">
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2 text-sm font-medium shadow-lg ring-1 ring-black/5 dark:ring-white/5"
        >
          {toast}
        </div>
      )}

      <BoardHeader
        projectList={projectList}
        selectedProject={selectedProject}
        showPicker={showPicker}
        preferredCount={effectivePreferred.length}
        availableKeys={availableKeys}
        pickerSet={pickerSet}
        countMap={countMap}
        boardNewKey={boardNewKey}
        boardValidating={boardValidating}
        boardValidateError={boardValidateError}
        onSelectProject={handleSelectProject}
        onOpenPicker={openPicker}
        onClosePicker={closePicker}
        onTogglePicker={togglePicker}
        onSelectAllKeys={() => setPickerSelection(availableKeys)}
        onCommit={commitPicker}
        onKeyChange={handleBoardNewKeyChange}
        onAddProject={handleAddProjectToBoard}
        boardSync={boardSync}
        isCurrentProjectSyncing={isCurrentProjectSyncing}
        isFetching={isFetching}
        onSync={syncJira}
        effectiveView={effectiveView}
        onViewChange={setView}
        width={width}
        columns={columns}
        visibleColumns={visibleColumns}
        byColumn={byColumn}
        hiddenCols={hiddenCols}
        collapsedCols={collapsedCols}
        hiddenTableCols={hiddenTableCols}
        onShowAllColumns={showAllColumns}
        onHideEmptyColumns={hideEmptyColumns}
        onToggleColumnVisibility={toggleColumnVisibility}
        onCollapseEmptyColumns={collapseEmptyColumns}
        onExpandAllCollapsedColumns={expandAllCollapsedColumns}
        onResetColumnPreferences={resetColumnPreferences}
        onToggleTableColumn={toggleTableColumn}
        onResetTableColumns={() => setHiddenTableCols(new Set())}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
      />

      {issueData?.sync.stale && <StaleSyncBanner lastSuccessAt={issueData.sync.lastSuccessAt} />}

      <IssueFilterBar
        value={filters}
        defaults={DEFAULT_BOARD_FILTERS}
        onChange={setFilters}
        options={{
          assignees,
          labels: labelOptions,
          priorities: optData?.priorities ?? ["Low", "Medium", "High", "Highest", "Blocker"],
        }}
        capabilities={{
          search: true,
          assignee: "multi",
          status: false,
          label: "single",
          priority: "single",
          quickSwitch: true,
        }}
        myName={myName}
        searchPlaceholder={`Tìm kiếm trong ${selectedProject}…`}
      />

      <BoardSummaryCards summary={summary} loading={isLoading} />

      {activeProject && (
        <BoardProjectSummaryLine
          projectKey={activeProject.key}
          issueCount={issues.length}
          lastSuccessAt={issueData?.sync.lastSuccessAt}
        />
      )}

      {effectiveView === "board" && hiddenCols.size > 0 && (
        <HiddenColumnsBanner
          columns={columns}
          hiddenCols={hiddenCols}
          onShowColumn={showColumn}
          onShowAll={showAllColumns}
        />
      )}

      {isLoading || isLoadingStatuses ? (
        <BoardSkeleton columnCount={columns.length || 5} />
      ) : issues.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Không có task nào để hiển thị"
          hint="Hãy thử điều chỉnh bộ lọc, hoặc làm mới dữ liệu để cập nhật bảng."
          className="flex-1"
        />
      ) : effectiveView === "board" ? (
        <BoardKanbanView
          boardScrollRef={boardScrollRef}
          sensors={dnd.sensors}
          collisionDetection={dnd.collisionDetection}
          onDragStart={dnd.onDragStart}
          onDragOver={dnd.onDragOver}
          onDragEnd={dnd.onDragEnd}
          onDragCancel={dnd.onDragCancel}
          activeDrag={dnd.activeDrag}
          boardColumnsRender={boardColumnsRender}
          transitionBusy={transitionBusy}
          dndDisabled={dndDisabled}
          setDragOverCol={dnd.setDragOverCol}
          allowedCols={dnd.allowedCols}
          optimistic={optimistic}
          visibleColumnsLength={visibleColumns.length}
          growColumn={growColumn}
          toggleCollapse={toggleCollapse}
          hideColumn={hideColumn}
          onOpen={(issue) => setQuickPanel(issue)}
          onQuickAction={handleQuickAction}
          onTransition={handleTransition}
          assignees={assignees}
          registerRef={(key, el) => cardRefs.current.set(key, el)}
          focusKey={focusKey}
        />
      ) : (
        <BoardListView
          issues={issues}
          hiddenTableCols={hiddenTableCols}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onOpen={setQuickPanel}
          onLoadMore={loadMore}
        />
      )}

      {quickPanel && (
        <QuickPanel
          issue={quickPanel}
          jiraBaseUrl={jiraBaseUrl}
          assignees={assignees}
          onClose={() => setQuickPanel(null)}
        />
      )}
    </div>
  );
}
