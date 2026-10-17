"use client";

import { DEFAULT_BOARD_FILTERS } from "@/lib/issues/issue-filters";
import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import { BoardHeader } from "./board-header";
import { BoardQuickFilterChips } from "./board-quick-filter-chips";
import { BoardStatsLine } from "./board-summary-cards";
import { HiddenColumnsBanner, StaleSyncBanner, SyncDisabledBanner } from "./board-banners";
import type { SortMode, ViewMode } from "./lib/board-types";
import type { BoardWidth } from "@/lib/status-groups";
import type { IssueSuccessResponse } from "@/hooks/use-issues";
import type { IssueFilterOptions } from "@/components/issues/issue-filter-bar";
import type { PeopleFieldData } from "./hooks/use-board-filter-options";
import type { useBoardProjectPicker } from "./hooks/use-board-project-picker";
import type { useBoardUserContext } from "./hooks/use-board-user-context";
import type { useBoardFilterController } from "./lib/board-filter-controller";
import type { useBoardColumnsModel } from "./hooks/use-board-columns-model";
import type { useBoardTableColumns } from "./hooks/use-board-table-columns";
import type { useJiraSync } from "./lib/use-jira-sync";

interface BoardToolbarSectionProps {
  picker: ReturnType<typeof useBoardProjectPicker>;
  userContext: ReturnType<typeof useBoardUserContext>;
  filterController: ReturnType<typeof useBoardFilterController>;
  columnsModel: ReturnType<typeof useBoardColumnsModel>;
  tableColumns: ReturnType<typeof useBoardTableColumns>;
  jiraSync: ReturnType<typeof useJiraSync>;
  view: ViewMode;
  effectiveView: ViewMode;
  sortMode: SortMode;
  onViewChange: (view: ViewMode) => void;
  onSortModeChange: (sort: SortMode) => void;
  onSelectProject: (key: string) => void;
  width: BoardWidth;
  issueData: IssueSuccessResponse | null;
  issuesCount: number;
  isLoading: boolean;
  isFetching: boolean;
  filterBarOptions: IssueFilterOptions;
  peopleFieldData?: PeopleFieldData | null;
  selectedProjectSyncDisabled: boolean;
  onCreateTask: () => void;
}

export function BoardToolbarSection({
  picker,
  userContext,
  filterController,
  columnsModel,
  tableColumns,
  jiraSync,
  effectiveView,
  sortMode,
  onViewChange,
  onSortModeChange,
  onSelectProject,
  width,
  issueData,
  issuesCount,
  isLoading,
  isFetching,
  filterBarOptions,
  peopleFieldData,
  selectedProjectSyncDisabled,
  onCreateTask,
}: BoardToolbarSectionProps) {
  const {
    filters,
    setFilters,
    quickFilter,
    setQuickFilter,
    teamMode,
    changeTeamMode,
  } = filterController;

  return (
    <>
      <BoardHeader
        projectList={picker.projectList}
        selectedProject={picker.selectedProject}
        showPicker={picker.showPicker}
        preferredCount={picker.effectivePreferred.length}
        availableKeys={userContext.availableKeys}
        pickerSet={picker.pickerSet}
        countMap={picker.countMap}
        boardNewKey={picker.boardNewKey}
        boardValidating={picker.boardValidating}
        boardValidateError={picker.boardValidateError}
        onSelectProject={onSelectProject}
        onPrefetchProject={picker.handlePrefetchProject}
        onOpenPicker={picker.openPicker}
        onClosePicker={picker.closePicker}
        onTogglePicker={picker.togglePicker}
        onSelectAllKeys={() => picker.setPickerSelection(userContext.availableKeys)}
        onCommit={picker.commitPicker}
        onKeyChange={picker.handleBoardNewKeyChange}
        onAddProject={picker.handleAddProjectToBoard}
        boardSync={jiraSync.boardSync}
        isCurrentProjectSyncing={jiraSync.isCurrentProjectSyncing}
        syncDisabled={selectedProjectSyncDisabled}
        isFetching={isFetching}
        onSync={jiraSync.syncJira}
        onCreateTask={onCreateTask}
        effectiveView={effectiveView}
        onViewChange={onViewChange}
        width={width}
        canUseTeamMode={userContext.canUseTeamMode}
        teamMode={teamMode}
        onTeamModeChange={changeTeamMode}
        columns={columnsModel.columns}
        visibleColumns={columnsModel.visibleColumns}
        byColumn={columnsModel.byColumn}
        hiddenCols={columnsModel.hiddenCols}
        collapsedCols={columnsModel.collapsedCols}
        hiddenTableCols={tableColumns.effectiveHiddenTableCols}
        onShowAllColumns={columnsModel.showAllColumns}
        onHideEmptyColumns={columnsModel.hideEmptyColumns}
        onToggleColumnVisibility={columnsModel.toggleColumnVisibility}
        onCollapseEmptyColumns={columnsModel.collapseEmptyColumns}
        onExpandAllCollapsedColumns={columnsModel.expandAllCollapsedColumns}
        onResetColumnPreferences={columnsModel.resetColumnPreferences}
        onToggleTableColumn={tableColumns.toggleTableColumn}
        onResetTableColumns={tableColumns.resetTableColumns}
        sortMode={sortMode}
        onSortModeChange={onSortModeChange}
      />

      {selectedProjectSyncDisabled ? (
        <SyncDisabledBanner projectKey={picker.selectedProject} lastSuccessAt={issueData?.sync.lastSuccessAt ?? null} />
      ) : (
        issueData?.sync.stale && <StaleSyncBanner lastSuccessAt={issueData.sync.lastSuccessAt} />
      )}

      <IssueFilterBar
        value={filters}
        defaults={DEFAULT_BOARD_FILTERS}
        onChange={setFilters}
        options={filterBarOptions}
        capabilities={{
          search: true,
          assignee: "multi",
          status: "multi",
          epic: "multi",
          label: "multi",
          priority: "multi",
          fixVersion: "multi",
          quickSwitch: true,
        }}
        myName={userContext.myName}
        searchPlaceholder={`Tìm kiếm trong ${picker.selectedProject}…`}
        collapseExtras
        extrasActive={quickFilter ? 1 : 0}
        extras={
          <BoardQuickFilterChips
            quickFilter={quickFilter}
            setQuickFilter={setQuickFilter}
            peopleFieldData={peopleFieldData ?? undefined}
          />
        }
      />

      <BoardStatsLine
        summary={columnsModel.summary}
        loading={isLoading}
        issueCount={issuesCount}
        lastSuccessAt={issueData?.sync.lastSuccessAt}
      />

      {effectiveView === "board" && columnsModel.hiddenCols.size > 0 && (
        <HiddenColumnsBanner
          columns={columnsModel.columns}
          hiddenCols={columnsModel.hiddenCols}
          onShowColumn={columnsModel.showColumn}
          onShowAll={columnsModel.showAllColumns}
        />
      )}
    </>
  );
}
