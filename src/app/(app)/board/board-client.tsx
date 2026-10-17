"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { IssueItem } from "@/hooks/use-issues";
import {
  DEFAULT_BOARD_FILTERS,
  countActiveIssueFilters,
} from "@/lib/issues/issue-filters";
import {
  loadStoredSortMode,
  loadStoredViewMode,
  saveStoredSortMode,
  saveStoredViewMode,
} from "./lib/board-storage";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { BoardSkeleton } from "./board-skeleton";
import { useIssueHoverPrefetch } from "./lib/issue-detail-queries";
import type { SortMode, ViewMode } from "./lib/board-types";
import { patchIssueLists } from "./lib/board-optimistic";
import { useBoardPerfMarks } from "./hooks/use-board-perf-marks";
import { BoardNoProjectsState } from "./board-empty-projects";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardBootstrap } from "@/lib/board/bootstrap";
import { useBoardKeyboardNav } from "./lib/board-keyboard-nav";
import { useBoardWidth, useTransitionCache } from "./lib/board-hooks";
import { useJiraSync } from "./lib/use-jira-sync";
import { useBoardFilterController } from "./lib/board-filter-controller";
import { useFlashMessage } from "@/hooks/use-flash-message";
import { BoardToast } from "./board-toast";
import { BoardContent } from "./board-content";
import { BoardToolbarSection } from "./board-toolbar-section";
import { useBoardProjectPicker } from "./hooks/use-board-project-picker";
import { useBoardFilterOptions } from "./hooks/use-board-filter-options";
import { useBoardColumnsModel } from "./hooks/use-board-columns-model";
import { useBoardUserContext } from "./hooks/use-board-user-context";
import { useBoardIssues } from "./hooks/use-board-issues";
import { useBoardActionsController } from "./hooks/use-board-actions-controller";
import { useBoardTableColumns } from "./hooks/use-board-table-columns";
import { TaskCreateDialog } from "@/components/task-create/task-create-dialog";

const BOARD_CREATE_SOURCE = { type: "single", origin: "board" } as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

const QuickPanel = dynamic(
  () => import("./board-quick-panel").then((m) => m.QuickPanel),
  { ssr: false }
);

export function BoardClient({ initialBootstrap }: { initialBootstrap?: BoardBootstrap | null } = {}) {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const { message: toast, show: setToast } = useFlashMessage();

  const userContext = useBoardUserContext(initialBootstrap);
  const {
    allProjects,
    myName,
    jiraBaseUrl,
    canUseTeamMode,
    prefs,
    prefsError,
    refetchPrefs,
    preferred,
    availableKeys,
  } = userContext;

  const [view, setView] = useState<ViewMode>(() => loadStoredViewMode() ?? "board");
  const [sortMode, setSortMode] = useState<SortMode>(() => loadStoredSortMode() ?? "updated");

  const replaceBoardUrl = useCallback(
    (url: string) => router.replace(url, { scroll: false }),
    [router]
  );

  const picker = useBoardProjectPicker({
    allProjects,
    preferred,
    availableKeys,
    initialBootstrap: initialBootstrap ?? undefined,
    onSelectProject: (key) => handleSelectProject(key),
    setToast,
  });

  const filterController = useBoardFilterController({
    searchParams,
    selectedProject: picker.selectedProject,
    myName,
    canUseTeamMode,
    persistProject: picker.selectedProject === picker.project,
    replaceUrl: replaceBoardUrl,
  });

  function handleSelectProject(nextKey: string) {
    if (nextKey === picker.selectedProject) return;
    filterController.selectProject(nextKey, picker.selectedProject);
    picker.setProject(nextKey);
  }

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
    picker.effectivePreferred.length > 0 &&
    Boolean(picker.selectedProject);

  const {
    assignees,
    listOptions,
    filterBarOptions,
    peopleFieldData,
  } = useBoardFilterOptions(picker.selectedProject, initialBootstrap ?? undefined);

  const width = useBoardWidth();
  const effectiveView: ViewMode = width === "narrow" ? "list" : view;

  const {
    issues,
    issueData,
    isLoading,
    isFetching,
    issuesError,
    refetchIssues,
    hasMore,
    loadingMore,
    loadMore,
  } = useBoardIssues({
    filters: filterController.boardFilters,
    enabled: boardQueriesEnabled,
    onLoadMoreError: (msg) => setToast(msg),
  });

  const columnsModel = useBoardColumnsModel({
    selectedProject: picker.selectedProject,
    issues,
    sortMode,
    filterSig: filterController.filterSignature,
    activeFilterCount: countActiveIssueFilters(filterController.filters, DEFAULT_BOARD_FILTERS),
    boardQueriesEnabled,
  });

  const handleOptimisticIssueUpdate = useCallback((patch: Partial<IssueItem> & { jiraKey: string }) => {
    patchIssueLists(qc, new Map([[patch.jiraKey, patch]]));
    setQuickPanel((prev) => (prev && prev.jiraKey === patch.jiraKey ? { ...prev, ...patch } : prev));
  }, [qc]);

  const jiraSync = useJiraSync(picker.selectedProject, setToast);
  const selectedProjectSyncDisabled =
    allProjects.find((p) => p.key === picker.selectedProject)?.syncEnabled === false;

  const { transitionCache, fetchTransitions, invalidateTransitionCache } = useTransitionCache();

  const actions = useBoardActionsController({
    issues,
    columns: columnsModel.columns,
    columnKeys: columnsModel.columnKeys,
    statusCategoryMap: columnsModel.statusCategoryMap,
    jiraBaseUrl,
    fetchTransitions,
    invalidateTransitionCache,
    setOptimisticStatus: columnsModel.setOptimisticStatus,
    setToast,
    router,
    qc,
    findColumnForIssue: columnsModel.findColumnForIssue,
    onOptimisticIssueUpdate: handleOptimisticIssueUpdate,
  });

  const openQuickPanel = useCallback((issue: IssueItem) => setQuickPanel(issue), []);
  const closeQuickPanel = useCallback(() => setQuickPanel(null), []);
  const registerCardRef = useCallback((key: string, el: HTMLElement | null) => {
    cardRefs.current.set(key, el);
  }, []);

  useBoardPerfMarks({
    initialBootstrap,
    hasIssueData: Boolean(issueData),
    columnsCount: columnsModel.columns.length,
    issuesCount: issues.length,
  });

  const tableColumns = useBoardTableColumns(peopleFieldData);

  const focusOrder = useMemo(
    () =>
      columnsModel.boardColumnsRender
        .filter((c) => !c.collapsed)
        .flatMap((c) => c.items.map((i) => i.jiraKey)),
    [columnsModel.boardColumnsRender]
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

  const [createOpen, setCreateOpen] = useState(false);
  const openCreateTask = useCallback(() => setCreateOpen(true), []);
  const canCreateTask = Boolean(picker.selectedProject) && quickPanel === null;

  // "c" opens the create dialog, unless the user is typing or another dialog is open.
  useEffect(() => {
    if (!canCreateTask) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "c" || e.repeat || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      setCreateOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCreateTask]);

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

  if (picker.effectivePreferred.length === 0) {
    return (
      <BoardNoProjectsState
        boardNewKey={picker.boardNewKey}
        boardValidating={picker.boardValidating}
        boardValidateError={picker.boardValidateError}
        hasAvailableKeys={availableKeys.length > 0}
        onKeyChange={picker.handleBoardNewKeyChange}
        onAddProject={picker.handleAddProjectToBoard}
        onPickFromList={() => picker.setShowPicker(true)}
      />
    );
  }

  const dndDisabled = effectiveView === "list" || actions.transitionBusy;

  return (
    <div
      className="relative flex h-full flex-col gap-3"
      onPointerOver={hoverPrefetch.onPointerOver}
      onPointerLeave={hoverPrefetch.onPointerLeave}
    >
      <BoardToast toast={toast} />

      <BoardToolbarSection
        picker={picker}
        userContext={userContext}
        filterController={filterController}
        columnsModel={columnsModel}
        tableColumns={tableColumns}
        jiraSync={jiraSync}
        view={view}
        effectiveView={effectiveView}
        sortMode={sortMode}
        onViewChange={handleViewChange}
        onSortModeChange={handleSortModeChange}
        onSelectProject={handleSelectProject}
        width={width}
        issueData={issueData}
        issuesCount={issues.length}
        isLoading={isLoading}
        isFetching={isFetching}
        filterBarOptions={filterBarOptions}
        peopleFieldData={peopleFieldData}
        selectedProjectSyncDisabled={selectedProjectSyncDisabled}
        onCreateTask={openCreateTask}
      />

      <BoardContent
        isLoading={isLoading}
        issuesError={issuesError}
        hasIssueData={Boolean(issueData)}
        selectedProject={picker.selectedProject}
        refetchIssues={() => void refetchIssues()}
        issues={issues}
        effectiveView={effectiveView}
        boardScrollRef={boardScrollRef}
        columnsModel={columnsModel}
        actions={actions}
        transitionCache={transitionCache}
        fetchTransitions={fetchTransitions}
        dndDisabled={dndDisabled}
        onOpen={openQuickPanel}
        assignees={assignees}
        registerRef={registerCardRef}
        focusKey={focusKey}
        hiddenTableCols={tableColumns.effectiveHiddenTableCols}
        listOptions={listOptions}
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadMore={loadMore}
      />

      {quickPanel && (
        <QuickPanel
          key={quickPanel.jiraKey}
          issue={quickPanel}
          jiraBaseUrl={jiraBaseUrl}
          assignees={assignees}
          onClose={closeQuickPanel}
          onOptimisticUpdate={handleOptimisticIssueUpdate}
        />
      )}

      {/* Stays mounted (driven by `open`) so polling and the success toast survive closing. */}
      <TaskCreateDialog
        open={createOpen && Boolean(picker.selectedProject)}
        onOpenChange={setCreateOpen}
        projectKey={picker.selectedProject}
        source={BOARD_CREATE_SOURCE}
      />
    </div>
  );
}
