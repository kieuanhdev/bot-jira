"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { type IssueFilters } from "@/lib/issues/issue-filters";
import { type IssueItem } from "@/hooks/use-issues";
import {
  BulkNoProjectState,
  BulkProjectSelector,
  BulkTaskFilters,
  BulkTaskList,
  BulkTaskListFooter,
  BulkTaskListToolbar,
} from "./bulk-select-step";

export interface BulkSelectCardProps {
  filterProject: string;
  projectOptions: { key: string; openCount: number }[];
  projectIssuesCount: number;
  onProjectChange: (project: string) => void;
  selectionMode: "pick" | "filter";
  taskFilters: IssueFilters;
  availableAssignees: string[];
  statusOptions: string[];
  epicOptions: { value: string; label: string }[];
  labelOptions: string[];
  priorityOptions: string[];
  myName?: string | null;
  filteredIssues: IssueItem[];
  onSelectionModeChange: (mode: "pick" | "filter") => void;
  onTaskFiltersChange: (filters: IssueFilters) => void;
  allSelected: boolean;
  selected: Set<string>;
  filterOnlySelected: boolean;
  sortOption:
    | "default"
    | "name-asc"
    | "name-desc"
    | "created-desc"
    | "created-asc"
    | "updated-desc";
  onToggleAll: () => void;
  onFilterOnlySelectedChange: (value: boolean) => void;
  onSortOptionChange: (
    sort:
      | "default"
      | "name-asc"
      | "name-desc"
      | "created-desc"
      | "created-asc"
      | "updated-desc"
  ) => void;
  isIssuesLoading: boolean;
  initialKeysSet: Set<string>;
  jiraBaseUrl: string;
  onToggle: (key: string) => void;
  loadedCount: number;
  totalServerIssues: number;
  isLoadingMore: boolean;
  effectiveCount: number;
  onLoadMore: () => void;
}

export function BulkSelectCard({
  filterProject,
  projectOptions,
  projectIssuesCount,
  onProjectChange,
  selectionMode,
  taskFilters,
  availableAssignees,
  statusOptions,
  epicOptions,
  labelOptions,
  priorityOptions,
  myName,
  filteredIssues,
  onSelectionModeChange,
  onTaskFiltersChange,
  allSelected,
  selected,
  filterOnlySelected,
  sortOption,
  onToggleAll,
  onFilterOnlySelectedChange,
  onSortOptionChange,
  isIssuesLoading,
  initialKeysSet,
  jiraBaseUrl,
  onToggle,
  loadedCount,
  totalServerIssues,
  isLoadingMore,
  effectiveCount,
  onLoadMore,
}: BulkSelectCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            1
          </span>
          Chọn phạm vi dự án & danh sách task
        </CardTitle>
        <CardDescription>
          Bắt buộc chọn một dự án trước. Thao tác hàng loạt chỉ thực hiện trên các task thuộc cùng một dự án.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <BulkProjectSelector
          filterProject={filterProject}
          projectOptions={projectOptions}
          issueCount={projectIssuesCount}
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
              myName={myName}
              filteredCount={filteredIssues.length}
              onSelectionModeChange={onSelectionModeChange}
              onTaskFiltersChange={onTaskFiltersChange}
            />

            <BulkTaskListToolbar
              selectionMode={selectionMode}
              allSelected={allSelected}
              selectedCount={selected.size}
              filteredCount={filteredIssues.length}
              filterOnlySelected={filterOnlySelected}
              sortOption={sortOption}
              onToggleAll={onToggleAll}
              onFilterOnlySelectedChange={onFilterOnlySelectedChange}
              onSortOptionChange={onSortOptionChange}
            />

            <BulkTaskList
              isIssuesLoading={isIssuesLoading}
              filteredIssues={filteredIssues}
              selectionMode={selectionMode}
              selected={selected}
              initialKeysSet={initialKeysSet}
              jiraBaseUrl={jiraBaseUrl}
              onToggle={onToggle}
            />
            <BulkTaskListFooter
              filterProject={filterProject}
              filteredCount={filteredIssues.length}
              loadedCount={loadedCount}
              totalServerIssues={totalServerIssues}
              isLoadingMore={isLoadingMore}
              effectiveCount={effectiveCount}
              onLoadMore={onLoadMore}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
