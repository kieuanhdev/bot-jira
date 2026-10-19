"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BulkNoProjectState,
  BulkProjectSelector,
  BulkTaskFilters,
  BulkTaskList,
  BulkTaskListFooter,
  BulkTaskListToolbar,
} from "./bulk-select-step";
import { BulkStepBadge } from "./bulk-step-badge";

import type { BulkSelectionController } from "./lib/use-bulk-selection";

export interface BulkSelectCardProps {
  selection: BulkSelectionController;
  /** Must also reset step 2/3 state, so the page owns it instead of `selection.handleProjectChange`. */
  onProjectChange: (project: string) => void;
  statusOptions: string[];
  myName?: string | null;
}

export function BulkSelectCard({
  selection,
  onProjectChange,
  statusOptions,
  myName,
}: BulkSelectCardProps) {
  const {
    filterProject,
    projectOptions,
    projectIssues,
    selectionMode,
    taskFilters,
    availableAssignees,
    epicOptions,
    labelOptions,
    priorityOptions,
    typeOptions,
    fixVersionOptions,
    reporterOptions,
    approverOptions,
    testerOptions,
    peopleFieldData,
    displayNames,
    quickFilter,
    setQuickFilter,
    filteredIssues,
    setSelectionMode,
    setTaskFilters,
    allSelected,
    selected,
    filterOnlySelected,
    sortOption,
    toggleAll,
    setFilterOnlySelected,
    setSortOption,
    isIssuesLoading,
    initialKeysSet,
    jiraBaseUrl,
    toggle,
    issues,
    totalServerIssues,
    isLoadingMore,
    effectiveCount,
    handleLoadMore,
  } = selection;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <BulkStepBadge step={1} />
          Chọn task
        </CardTitle>
        <CardDescription>Mỗi lần chỉ làm việc trên một dự án.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <BulkProjectSelector
          filterProject={filterProject}
          projectOptions={projectOptions}
          issueCount={projectIssues.length}
          onProjectChange={onProjectChange}
        />

        {!filterProject ? (
          <BulkNoProjectState />
        ) : (
          <>
            <BulkTaskFilters
              filterProject={filterProject}
              selectionMode={selectionMode}
              taskFilters={taskFilters}
              availableAssignees={availableAssignees}
              statusOptions={statusOptions}
              epicOptions={epicOptions}
              labelOptions={labelOptions}
              priorityOptions={priorityOptions}
              typeOptions={typeOptions}
              fixVersionOptions={fixVersionOptions}
              reporterOptions={reporterOptions}
              approverOptions={approverOptions}
              testerOptions={testerOptions}
              peopleFieldData={peopleFieldData}
              displayNames={displayNames}
              quickFilter={quickFilter}
              onQuickFilterChange={setQuickFilter}
              myName={myName}
              filteredCount={filteredIssues.length}
              onSelectionModeChange={setSelectionMode}
              onTaskFiltersChange={setTaskFilters}
            />

            <BulkTaskListToolbar
              selectionMode={selectionMode}
              allSelected={allSelected}
              selectedCount={selected.size}
              filteredCount={filteredIssues.length}
              filterOnlySelected={filterOnlySelected}
              sortOption={sortOption}
              onToggleAll={toggleAll}
              onFilterOnlySelectedChange={setFilterOnlySelected}
              onSortOptionChange={setSortOption}
            />

            <BulkTaskList
              isIssuesLoading={isIssuesLoading}
              filteredIssues={filteredIssues}
              selectionMode={selectionMode}
              selected={selected}
              initialKeysSet={initialKeysSet}
              jiraBaseUrl={jiraBaseUrl}
              onToggle={toggle}
            />
            <BulkTaskListFooter
              filterProject={filterProject}
              filteredCount={filteredIssues.length}
              loadedCount={issues.length}
              totalServerIssues={totalServerIssues}
              isLoadingMore={isLoadingMore}
              effectiveCount={effectiveCount}
              selectionMode={selectionMode}
              onLoadMore={handleLoadMore}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
