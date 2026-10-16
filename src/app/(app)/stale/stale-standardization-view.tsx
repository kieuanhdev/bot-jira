"use client";

import type { RequirementCode } from "@/lib/issues/standardization";
import type { StandardizationTask, StaleResponse } from "./lib/stale-types";
import type { useStaleUrlState } from "./hooks/use-stale-url-state";
import { JiraUsernameWarning, StandardizationMetricCards, StandardizationOverviewCard } from "./stale-std-overview";
import { StandardizationFilterCard } from "./stale-std-filters";
import { StandardizationTaskList } from "./stale-std-task-list";

export interface StandardizationViewProps {
  data: StaleResponse;
  hasJiraUsername: boolean;
  allStdTasks: StandardizationTask[];
  filteredStdTasks: StandardizationTask[];
  selectedStdTasks: Set<string>;
  urlState: ReturnType<typeof useStaleUrlState>;
  onFilterToSingleProject: (projectKey: string) => void;
  onToggleSelect: (key: string) => void;
  onSelectAll: (checked: boolean) => void;
  onClearSelection: () => void;
}

export function StandardizationView({
  data,
  hasJiraUsername,
  allStdTasks,
  filteredStdTasks,
  selectedStdTasks,
  urlState,
  onFilterToSingleProject,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: StandardizationViewProps) {
  const standardizationSummary = data.myWork?.standardization;
  const totalActive = data.myWork?.totalActive ?? 0;
  const incompleteCount = standardizationSummary?.incomplete ?? 0;
  const completeCount = standardizationSummary?.complete ?? 0;
  const missingCounts = standardizationSummary?.missingCounts ?? {
    ESTIMATION: 0,
    WORKLOG: 0,
    FIX_VERSION: 0,
    DUE_DATE: 0,
  };
  const completePercent = totalActive > 0 ? Math.round((completeCount / totalActive) * 100) : 100;

  return (
    <div className="flex flex-col gap-5">
      {/* Unconfigured Jira Username warning */}
      {!hasJiraUsername && !data.myWork?.username && <JiraUsernameWarning />}

      {/* Standardization Overview Card */}
      <StandardizationOverviewCard
        allStdTasks={allStdTasks}
        selectedStdTasks={selectedStdTasks}
        incompleteCount={incompleteCount}
        completeCount={completeCount}
        totalActive={totalActive}
        completePercent={completePercent}
        lastSyncedAt={data.myWork?.lastSyncedAt}
        onFilterToSingleProject={onFilterToSingleProject}
      />

      {/* 4 Interactive Metric Breakdown Cards */}
      <StandardizationMetricCards
        missingCounts={missingCounts}
        stdMissingFilter={urlState.stdMissingFilter}
        onToggle={(code: RequirementCode) =>
          urlState.setStdMissingFilter(urlState.stdMissingFilter === code ? "ALL" : code)
        }
      />

      {/* Filter Bar for Standardization Queue */}
      <StandardizationFilterCard
        stdSearch={urlState.stdSearch}
        stdProjectFilter={urlState.stdProjectFilter}
        stdStaleFilter={urlState.stdStaleFilter}
        stdSort={urlState.stdSort}
        projects={data.filters.projects ?? []}
        hasStdFilters={urlState.hasStdFilters}
        onSearchChange={urlState.setStdSearch}
        onProjectChange={urlState.setStdProjectFilter}
        onStaleChange={urlState.setStdStaleFilter}
        onSortChange={urlState.setStdSort}
        onClear={urlState.clearStdFilters}
      />

      {/* Standardization Task List Card */}
      <StandardizationTaskList
        filteredStdTasks={filteredStdTasks}
        allStdTasks={allStdTasks}
        selectedStdTasks={selectedStdTasks}
        incompleteCount={incompleteCount}
        totalActive={totalActive}
        hasStdFilters={urlState.hasStdFilters}
        onFilterToSingleProject={onFilterToSingleProject}
        onClearFilters={urlState.clearStdFilters}
        onViewStale={() => urlState.setActiveTab("stale")}
        onToggleSelect={onToggleSelect}
        onSelectAll={onSelectAll}
        onClearSelection={onClearSelection}
      />
    </div>
  );
}
