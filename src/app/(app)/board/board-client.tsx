"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  useIssues,
  useMoreIssues,
  type IssueItem,
  type IssueSuccessResponse,
} from "@/hooks/use-issues";
import { issuesKeys, boardKeys, meKeys } from "@/lib/query-keys";
import {
  DEFAULT_BOARD_FILTERS,
  countActiveIssueFilters,
} from "@/lib/issues/issue-filters";
import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import {
  loadStoredProject,
  loadStoredSortMode,
  loadStoredViewMode,
  saveStoredSortMode,
  saveStoredViewMode,
} from "./lib/board-storage";
import { AlertCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { BoardStatsLine } from "./board-summary-cards";
import { BoardSkeleton } from "./board-column";
import { useIssueHoverPrefetch } from "./lib/issue-detail-queries";
import {
  type Project,
  type QuickAction,
  type SortMode,
  type ViewMode,
} from "./lib/board-types";
import { patchIssueLists } from "./lib/board-optimistic";
import { sortIssues, columnKeyForIssue } from "./lib/board-utils";
import { HiddenColumnsBanner, StaleSyncBanner, SyncDisabledBanner } from "./board-banners";
import { useBoardPerfMarks } from "./hooks/use-board-perf-marks";
import { BoardNoProjectsState } from "./board-empty-projects";
import { BoardHeader } from "./board-header";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardBootstrap } from "@/lib/board/bootstrap";

// Lazy-loaded components to keep initial bundle size minimal
const BoardKanbanView = dynamic(
  () => import("./board-kanban-view").then((m) => m.BoardKanbanView),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> }
);
const BoardListView = dynamic(
  () => import("./board-list-view").then((m) => m.BoardListView),
  { ssr: false, loading: () => <Skeleton className="h-96 w-full" /> }
);
const QuickPanel = dynamic(
  () => import("./board-quick-panel").then((m) => m.QuickPanel),
  { ssr: false }
);

import { useBoardKeyboardNav } from "./lib/board-keyboard-nav";
import { useBoardActions } from "./lib/board-actions-hook";
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
  useTransitionCache,
} from "./lib/board-hooks";
import { useJiraSync } from "./lib/use-jira-sync";
import { useBoardFilterController } from "./lib/board-filter-controller";
import { applyOptimisticStatus, useBoardOptimisticStatus } from "./lib/use-board-optimistic";

export function BoardClient({ initialBootstrap }: { initialBootstrap?: BoardBootstrap | null } = {}) {
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
    initialData: initialBootstrap?.projects,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const allProjects = useMemo(() => projects?.items ?? [], [projects?.items]);

  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () =>
      api<{ jiraName: string | null; jiraBaseUrl?: string; role?: string; canBoardTeam?: boolean }>("/api/me/status"),
    initialData: initialBootstrap?.meStatus,
    retry: 0,
  });
  const myName = meStatus?.jiraName ?? null;
  const jiraBaseUrl = meStatus?.jiraBaseUrl ?? "";
  const canUseTeamMode = Boolean(meStatus?.canBoardTeam);

  // Keep the default retry: a single failed request here used to leave the board on the
  // "no project selected" screen until the page was remounted.
  const {
    data: prefs,
    isError: prefsError,
    refetch: refetchPrefs,
  } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    initialData: initialBootstrap?.preferences,
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[] | null>(null);

  const preferred = useMemo(() => prefs?.projects ?? [], [prefs?.projects]);
  const availableKeys = useMemo(() => prefs?.available ?? [], [prefs?.available]);

  const searchParams = useSearchParams();
  const urlProject = searchParams?.get("project")?.trim().toUpperCase() || "";

  const [project, setProject] = useState<string>(() => {
    if (urlProject) return urlProject;
    if (initialBootstrap?.initialProject) return initialBootstrap.initialProject;
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
        .map((k) => ({
          key: k,
          openCount: countMap.get(k) ?? 0,
          syncDisabled: allProjects.find((p) => p.key === k)?.syncEnabled === false,
        })),
    [effectivePreferred, countMap, availableKeys, allProjects]
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

  // Warm the per-project caches on hover so the switch doesn't wait on three cold requests.
  function handlePrefetchProject(key: string) {
    void qc.prefetchQuery({
      queryKey: boardKeys.statuses(key),
      queryFn: () => api<BoardStatusesResponse>(`/api/board/statuses?project=${key}`),
      staleTime: 5 * 60_000,
    });
    void qc.prefetchQuery({
      queryKey: issuesKeys.filters(key),
      queryFn: () => api(`/api/issues/filters?project=${key}`),
      staleTime: 5 * 60_000,
    });
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
      setToast(
        res.bootstrap?.state === "sync_disabled"
          ? `Đã thêm dự án ${res.project.name} (${verifiedKey}). Quản trị viên đang tắt đồng bộ dự án này.`
          : `Đã thêm dự án ${res.project.name} (${verifiedKey}) và bắt đầu đồng bộ.`
      );
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
  const replaceBoardUrl = useCallback(
    (url: string) => router.replace(url, { scroll: false }),
    [router]
  );
  const filterController = useBoardFilterController({
    searchParams,
    selectedProject,
    myName,
    canUseTeamMode,
    // Only remember the user's own pick, not the first-project fallback used while it's invalid.
    persistProject: selectedProject === project,
    replaceUrl: replaceBoardUrl,
  });
  const {
    filters,
    setFilters,
    quickFilter,
    setQuickFilter,
    boardFilters,
    filterSignature: filterSig,
    teamMode,
    changeTeamMode,
  } = filterController;

  function handleSelectProject(nextKey: string) {
    if (nextKey === selectedProject) return;
    filterController.selectProject(nextKey, selectedProject);
    setProject(nextKey);
  }

  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return loadStoredSortMode() ?? "updated";
  });

  function handleViewChange(nextView: ViewMode) {
    setView(nextView);
    saveStoredViewMode(nextView);
  }

  function handleSortModeChange(nextSort: SortMode) {
    setSortMode(nextSort);
    saveStoredSortMode(nextSort);
  }

  const [quickPanel, setQuickPanel] = useState<IssueItem | null>(null);
  const hoverPrefetch = useIssueHoverPrefetch();
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const boardQueriesEnabled =
    filterController.filtersReady &&
    effectivePreferred.length > 0 &&
    Boolean(selectedProject);

  const activeFilterCount = countActiveIssueFilters(filters, DEFAULT_BOARD_FILTERS);

  const [colVisibleState, setColVisibleState] = useState<{ sig: string; counts: Record<string, number> }>({
    sig: "",
    counts: {},
  });

  const width = useBoardWidth();
  const effectiveView: ViewMode = width === "narrow" ? "list" : view;

  const { data, isLoading, isFetching, isError: issuesError, refetch: refetchIssues } = useIssues(boardFilters, {
    enabled: boardQueriesEnabled,
  });

  const issueData: IssueSuccessResponse | null =
    data && "items" in data ? (data as IssueSuccessResponse) : null;

  const {
    items: extraIssues,
    hasMore,
    loading: loadingMore,
    loadMore,
  } = useMoreIssues(boardFilters, issueData, {
    onError: (e) => setToast(`Couldn't load more tasks: ${e.message.slice(0, 80)}`),
  });

  const issues: IssueItem[] = useMemo(
    () => (issueData ? [...issueData.items, ...extraIssues] : [...extraIssues]),
    [issueData, extraIssues]
  );

  const handleOptimisticIssueUpdate = useCallback((patch: Partial<IssueItem> & { jiraKey: string }) => {
    // Every loaded page lives in the query cache, so one merge covers first and extra pages.
    patchIssueLists(qc, new Map([[patch.jiraKey, patch]]));
    setQuickPanel((prev) => (prev && prev.jiraKey === patch.jiraKey ? { ...prev, ...patch } : prev));
  }, [qc]);

  const { boardSync, isCurrentProjectSyncing, syncJira } = useJiraSync(selectedProject, setToast);
  const selectedProjectSyncDisabled =
    allProjects.find((p) => p.key === selectedProject)?.syncEnabled === false;



  const { data: optData } = useQuery({
    queryKey: issuesKeys.filters(selectedProject),
    enabled: Boolean(selectedProject) && Boolean(issueData),
    queryFn: () =>
      api<{
        assignees: string[]; labels: string[]; priorities: string[]; statuses: string[];
        epics: string[]; types: string[]; fixVersions: string[]; reporters: string[];
        approvers: string[]; testers: string[];
        displayNames: Record<string, string>;
      }>(
        `/api/issues/filters?project=${selectedProject}`
      ),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const assignees = useMemo(() => optData?.assignees ?? [], [optData?.assignees]);
  const labelOptions = optData?.labels ?? [];
  const personOptions = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: optData?.displayNames?.[value] ? `${optData.displayNames[value]} (${value})` : value }));

  // Approver/tester lists only hold people already set on some issue, so pick from everyone on the project.
  const listOptions = useMemo(() => {
    const everyone = [
      ...new Set([
        ...(optData?.assignees ?? []),
        ...(optData?.reporters ?? []),
        ...(optData?.approvers ?? []),
        ...(optData?.testers ?? []),
      ]),
    ].sort((a, b) => a.localeCompare(b));
    return {
      statuses: optData?.statuses ?? [],
      assignees: everyone,
      types: optData?.types ?? [],
      epics: optData?.epics ?? [],
      reporters: everyone,
      approvers: everyone,
      testers: everyone,
    };
  }, [optData]);

  const { data: peopleFieldData } = useQuery({
    queryKey: ["projects", selectedProject, "people-fields"],
    enabled: Boolean(selectedProject),
    queryFn: () => api<{ fields: { reporter: string; approver?: string | null; tester?: string | null } }>(
      `/api/projects/${encodeURIComponent(selectedProject)}/people-fields`
    ),
    initialData:
      initialBootstrap && initialBootstrap.initialProject === selectedProject
        ? (initialBootstrap.peopleFieldData ?? undefined)
        : undefined,
    staleTime: 5 * 60_000,
  });

  const quickPanelRef = useRef(quickPanel);
  useEffect(() => {
    quickPanelRef.current = quickPanel;
  }, [quickPanel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (e.key === "Escape" && quickPanelRef.current) {
        setQuickPanel(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const { optimistic, setOptimisticStatus } = useBoardOptimisticStatus();

  const columnKeyByStatusId = useMemo(() => indexColumnsByStatusId(columns), [columns]);
  const columnKeyByStatus = useMemo(() => indexColumnsByStatus(columns), [columns]);

  function findColumnForIssue(issue: IssueItem): string {
    const effective = applyOptimisticStatus(issue, optimistic);
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

  const { transitionCache, fetchTransitions, invalidateTransitionCache } = useTransitionCache();

  const {
    transitionBusy,
    handleTransition,
    handleQuickAction,
    handleEdits,
    handleBulkTransition,
    handleInlineTransition,
  } = useBoardActions({
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
    onOptimisticIssueUpdate: handleOptimisticIssueUpdate,
  });

  // Stable identities so memoized columns/cards don't re-render on unrelated state changes.
  const latestActions = useRef({ handleTransition, handleQuickAction });
  useEffect(() => {
    latestActions.current = { handleTransition, handleQuickAction };
  });
  const stableTransition = useCallback(
    (key: string, target: string) => latestActions.current.handleTransition(key, target),
    []
  );
  const stableQuickAction = useCallback(
    (key: string, action: QuickAction) => latestActions.current.handleQuickAction(key, action),
    []
  );
  const openQuickPanel = useCallback((issue: IssueItem) => setQuickPanel(issue), []);
  const registerCardRef = useCallback((key: string, el: HTMLElement | null) => {
    cardRefs.current.set(key, el);
  }, []);

  useBoardPerfMarks({
    initialBootstrap,
    hasIssueData: Boolean(issueData),
    columnsCount: columns.length,
    issuesCount: issues.length,
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
  const effectiveHiddenTableCols = useMemo(() => {
    const next = new Set(hiddenTableCols);
    if (peopleFieldData && !peopleFieldData.fields.approver) next.add("approver");
    if (peopleFieldData && !peopleFieldData.fields.tester) next.add("tester");
    return next;
  }, [hiddenTableCols, peopleFieldData]);
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

  if (!prefs) {
    return prefsError ? (
      <EmptyState
        icon={AlertCircle}
        title="Không tải được danh sách dự án"
        hint="Kết nối tới máy chủ bị gián đoạn. Hãy thử tải lại."
        action={
          <Button size="sm" variant="outline" onClick={() => void refetchPrefs()}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Thử lại
          </Button>
        }
        className="m-4"
      />
    ) : (
      <div className="flex h-full flex-col gap-3" aria-busy="true" aria-label="Đang tải">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-9 w-full" />
        <BoardSkeleton columnCount={5} />
      </div>
    );
  }

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
    <div
      className="relative flex h-full flex-col gap-3"
      onPointerOver={hoverPrefetch.onPointerOver}
      onPointerLeave={hoverPrefetch.onPointerLeave}
    >
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
        onPrefetchProject={handlePrefetchProject}
        onOpenPicker={openPicker}
        onClosePicker={closePicker}
        onTogglePicker={togglePicker}
        onSelectAllKeys={() => setPickerSelection(availableKeys)}
        onCommit={commitPicker}
        onKeyChange={handleBoardNewKeyChange}
        onAddProject={handleAddProjectToBoard}
        boardSync={boardSync}
        isCurrentProjectSyncing={isCurrentProjectSyncing}
        syncDisabled={selectedProjectSyncDisabled}
        isFetching={isFetching}
        onSync={syncJira}
        effectiveView={effectiveView}
        onViewChange={handleViewChange}
        width={width}
        canUseTeamMode={canUseTeamMode}
        teamMode={teamMode}
        onTeamModeChange={changeTeamMode}
        columns={columns}
        visibleColumns={visibleColumns}
        byColumn={byColumn}
        hiddenCols={hiddenCols}
        collapsedCols={collapsedCols}
        hiddenTableCols={effectiveHiddenTableCols}
        onShowAllColumns={showAllColumns}
        onHideEmptyColumns={hideEmptyColumns}
        onToggleColumnVisibility={toggleColumnVisibility}
        onCollapseEmptyColumns={collapseEmptyColumns}
        onExpandAllCollapsedColumns={expandAllCollapsedColumns}
        onResetColumnPreferences={resetColumnPreferences}
        onToggleTableColumn={toggleTableColumn}
        onResetTableColumns={() => setHiddenTableCols(new Set())}
        sortMode={sortMode}
        onSortModeChange={handleSortModeChange}
      />

      {selectedProjectSyncDisabled ? (
        <SyncDisabledBanner projectKey={selectedProject} lastSuccessAt={issueData?.sync.lastSuccessAt ?? null} />
      ) : (
        issueData?.sync.stale && <StaleSyncBanner lastSuccessAt={issueData.sync.lastSuccessAt} />
      )}

      <IssueFilterBar
        value={filters}
        defaults={DEFAULT_BOARD_FILTERS}
        onChange={setFilters}
        options={{
          assignees: personOptions(assignees),
          labels: labelOptions,
          priorities: optData?.priorities ?? ["Low", "Medium", "High", "Highest", "Blocker"],
          statuses: optData?.statuses ?? [],
          epics: optData?.epics ?? [],
          types: optData?.types ?? [],
          fixVersions: optData?.fixVersions ?? [],
          reporters: personOptions(optData?.reporters),
          approvers: personOptions(optData?.approvers),
          testers: personOptions(optData?.testers),
        }}
        capabilities={{
          search: true,
          assignee: "multi",
          status: "multi",
          epic: "multi",
          label: "multi",
          priority: "multi",
          role: "multi",
          reporter: "multi",
          approver: peopleFieldData?.fields.approver ? "multi" : false,
          tester: peopleFieldData?.fields.tester ? "multi" : false,
          type: "multi",
          fixVersion: "multi",
          quickSwitch: true,
        }}
        myName={myName}
        searchPlaceholder={`Tìm kiếm trong ${selectedProject}…`}
        collapseExtras
        extrasActive={quickFilter ? 1 : 0}
        extras={
          <div className="flex flex-wrap items-center gap-1 border-l pl-2">
            {([
              ["overdue", "Quá hạn"], ["unassigned", "Chưa assign"], ["unestimated", "Chưa estimate"], ["stale", "Stale 7d+"],
              ...(peopleFieldData?.fields.approver ? [["missingApprover", "Thiếu Approver"]] : []),
              ...(peopleFieldData?.fields.tester ? [["missingTester", "Thiếu Tester"]] : []),
            ] as Array<[typeof quickFilter, string]>).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setQuickFilter((current) => current === key ? "" : key)} className={`h-7 cursor-pointer rounded-full border px-2.5 text-[11px] font-medium transition-colors ${quickFilter === key ? "border-primary/50 bg-primary/10 text-primary" : "bg-background hover:bg-muted"}`}>{label}</button>
            ))}
          </div>
        }
      />

      <BoardStatsLine
        summary={summary}
        loading={isLoading}
        issueCount={issues.length}
        lastSuccessAt={issueData?.sync.lastSuccessAt}
      />

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
      ) : issuesError && !issueData ? (
        <EmptyState
          icon={AlertCircle}
          title={`Không tải được task của ${selectedProject}`}
          hint="Yêu cầu tới máy chủ bị lỗi. Hãy thử tải lại."
          action={
            <Button size="sm" variant="outline" onClick={() => void refetchIssues()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Thử lại
            </Button>
          }
          className="flex-1"
        />
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
          issues={issues}
          columns={columns}
          statusCategoryMap={statusCategoryMap}
          transitionCache={transitionCache}
          fetchTransitions={fetchTransitions}
          findColumnForIssue={findColumnForIssue}
          boardColumnsRender={boardColumnsRender}
          transitionBusy={transitionBusy}
          dndDisabled={dndDisabled}
          optimistic={optimistic}
          visibleColumnsLength={visibleColumns.length}
          growColumn={growColumn}
          toggleCollapse={toggleCollapse}
          hideColumn={hideColumn}
          onOpen={openQuickPanel}
          onQuickAction={stableQuickAction}
          onTransition={stableTransition}
          assignees={assignees}
          registerRef={registerCardRef}
          focusKey={focusKey}
        />
      ) : (
        <BoardListView
          issues={issues}
          hiddenTableCols={effectiveHiddenTableCols}
          options={listOptions}
          statusOverrides={optimistic}
          onEdits={(targets, api, itemFor) => void handleEdits(targets, api, itemFor)}
          onTransition={(issue, id, to) => void handleInlineTransition(issue, id, to)}
          onBulkTransition={(targets, to) => void handleBulkTransition(targets, to)}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onOpen={setQuickPanel}
          onLoadMore={loadMore}
        />
      )}

      {quickPanel && (
        <QuickPanel
          // Remount per issue so panel-local drafts (worklog, link, optimistic
          // overrides) never leak into the next task opened.
          key={quickPanel.jiraKey}
          issue={quickPanel}
          jiraBaseUrl={jiraBaseUrl}
          assignees={assignees}
          onClose={() => setQuickPanel(null)}
          onOptimisticUpdate={handleOptimisticIssueUpdate}
        />
      )}
    </div>
  );
}
