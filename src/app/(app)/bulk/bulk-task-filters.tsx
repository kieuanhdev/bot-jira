"use client";

import { useMemo, type ComponentProps } from "react";
import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { DEFAULT_BULK_FILTERS, type IssueFilters } from "@/lib/issues/issue-filters";
import { cn } from "@/lib/utils";
import type { SelectionMode } from "./lib/bulk-logic";

export interface BulkTaskFiltersProps {
  filterProject: string;
  selectionMode: SelectionMode;
  taskFilters: IssueFilters;
  availableAssignees: string[];
  statusOptions: string[];
  epicOptions: { value: string; label: string }[];
  labelOptions: string[];
  priorityOptions: string[];
  typeOptions?: string[];
  fixVersionOptions?: string[];
  reporterOptions?: string[];
  approverOptions?: string[];
  testerOptions?: string[];
  peopleFieldData?: { fields: { reporter: string; approver?: string | null; tester?: string | null } } | null;
  displayNames?: Record<string, string>;
  quickFilter?: string;
  onQuickFilterChange?: (filter: string) => void;
  myName: string | null | undefined;
  filteredCount: number;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onTaskFiltersChange: (filters: IssueFilters) => void;
  options?: ComponentProps<typeof IssueFilterBar>["options"];
  capabilities?: ComponentProps<typeof IssueFilterBar>["capabilities"];
}

export function BulkTaskFilters({
  filterProject,
  selectionMode,
  taskFilters,
  availableAssignees,
  statusOptions,
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
  onQuickFilterChange,
  myName,
  filteredCount,
  onSelectionModeChange,
  onTaskFiltersChange,
  options: externalOptions,
  capabilities: externalCapabilities,
}: BulkTaskFiltersProps) {
  const personOptions = useMemo(() => {
    return (values: string[] | undefined) =>
      (values ?? []).map((value) => ({
        value,
        label: displayNames?.[value] ? `${displayNames[value]} (${value})` : value,
      }));
  }, [displayNames]);

  const computedOptions = useMemo(
    () =>
      externalOptions ?? {
        assignees: personOptions(availableAssignees),
        statuses: statusOptions,
        epics: epicOptions,
        labels: labelOptions,
        priorities: priorityOptions,
        types: typeOptions ?? [],
        fixVersions: fixVersionOptions ?? [],
        reporters: personOptions(reporterOptions),
        approvers: personOptions(approverOptions),
        testers: personOptions(testerOptions),
      },
    [
      externalOptions,
      personOptions,
      availableAssignees,
      statusOptions,
      epicOptions,
      labelOptions,
      priorityOptions,
      typeOptions,
      fixVersionOptions,
      reporterOptions,
      approverOptions,
      testerOptions,
    ]
  );

  const computedCapabilities = useMemo(
    () =>
      externalCapabilities ?? {
        search: true,
        assignee: "multi" as const,
        status: "multi" as const,
        epic: "multi" as const,
        label: "multi" as const,
        priority: "multi" as const,
        role: "multi" as const,
        reporter: "multi" as const,
        approver: peopleFieldData?.fields?.approver ? ("multi" as const) : (false as const),
        tester: peopleFieldData?.fields?.tester ? ("multi" as const) : (false as const),
        type: "multi" as const,
        fixVersion: "multi" as const,
        quickSwitch: true,
      },
    [externalCapabilities, peopleFieldData?.fields?.approver, peopleFieldData?.fields?.tester]
  );

  return (
    <div className="flex flex-col gap-3 border-b p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          aria-label="Chế độ chọn"
          tone="neutral"
          value={selectionMode}
          onChange={onSelectionModeChange}
          items={[
            { value: "pick", label: "Chọn từng task" },
            { value: "filter", label: "Tất cả khớp bộ lọc" },
          ]}
        />
        {selectionMode === "filter" && (
          <span className="text-xs text-muted-foreground font-medium">
            Server sẽ áp dụng cho toàn bộ task khớp bộ lọc trong dự án {filterProject}
          </span>
        )}
      </div>

      <IssueFilterBar
        value={taskFilters}
        defaults={DEFAULT_BULK_FILTERS}
        onChange={onTaskFiltersChange}
        onReset={() => {
          onTaskFiltersChange(DEFAULT_BULK_FILTERS);
          onQuickFilterChange?.("");
        }}
        options={computedOptions}
        capabilities={computedCapabilities}
        myName={myName}
        searchPlaceholder={`Tìm kiếm trong ${filterProject}…`}
        collapseExtras
        extrasActive={quickFilter ? 1 : 0}
        extras={
          <div className="flex flex-wrap items-center gap-1 border-l pl-2">
            {([
              ["overdue", "Quá hạn"],
              ["unassigned", "Chưa assign"],
              ["unestimated", "Chưa estimate"],
              ["stale", "Stale 7d+"],
              ...(peopleFieldData?.fields?.approver ? [["missingApprover", "Thiếu Approver"]] : []),
              ...(peopleFieldData?.fields?.tester ? [["missingTester", "Thiếu Tester"]] : []),
            ] as Array<[string, string]>).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onQuickFilterChange?.(quickFilter === key ? "" : key)}
                className={cn(
                  "h-7 cursor-pointer rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                  quickFilter === key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "bg-background hover:bg-muted"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      <p className="text-[11px] text-muted-foreground">
        {filteredCount} task khớp bộ lọc
        {selectionMode === "filter" ? " · khi chạy sẽ áp dụng cho toàn bộ task khớp trong dự án, không chỉ phần hiển thị" : ""}
      </p>
    </div>
  );
}
