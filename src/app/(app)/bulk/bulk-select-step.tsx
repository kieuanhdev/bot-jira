import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_BULK_FILTERS, type IssueFilters } from "@/lib/issues/issue-filters";
import { cn } from "@/lib/utils";
import {
  ArrowUpDown,
  Filter,
  ListChecks,
  Loader2,
} from "lucide-react";
import type { SelectionMode, SortOption } from "./lib/bulk-logic";

export function BulkProjectSelector({
  filterProject,
  projectOptions,
  issueCount,
  onProjectChange,
}: {
  filterProject: string;
  projectOptions: { key: string; openCount: number }[];
  issueCount: number;
  onProjectChange: (project: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1 sm:max-w-xs w-full">
        <label htmlFor="project-scope-select" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          Dự án mục tiêu <span className="text-destructive">*</span>
        </label>
        <Select value={filterProject} onValueChange={onProjectChange}>
          <SelectTrigger id="project-scope-select" aria-label="Chọn dự án bắt buộc" className="font-medium bg-background">
            <SelectValue placeholder="— Chọn một dự án —" />
          </SelectTrigger>
          <SelectContent>
            {projectOptions.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                <span className="font-semibold">{p.key}</span>
                <span className="ml-2 text-xs text-muted-foreground">({p.openCount} task mở)</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filterProject ? (
        <div className="flex items-center gap-2">
          <Badge variant="info" className="px-3 py-1">
            Dự án: {filterProject} · {issueCount} task trong bộ nhớ
          </Badge>
        </div>
      ) : (
        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
          Vui lòng chọn dự án để tải danh sách task
        </p>
      )}
    </div>
  );
}

export function BulkNoProjectState() {
  return (
    <div className="flex flex-col items-center p-12 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ListChecks className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-semibold">Chưa chọn dự án</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Hãy chọn một dự án ở trên. Mọi thao tác chỉnh sửa hàng loạt và cấu hình trường sẽ được giới hạn riêng cho dự án đó.
      </p>
    </div>
  );
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
}: {
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
}) {
  const personOptions = (values: string[] | undefined) =>
    (values ?? []).map((value) => ({
      value,
      label: displayNames?.[value] ? `${displayNames[value]} (${value})` : value,
    }));

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
        options={{
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
          approver: peopleFieldData?.fields?.approver ? "multi" : false,
          tester: peopleFieldData?.fields?.tester ? "multi" : false,
          type: "multi",
          fixVersion: "multi",
          quickSwitch: true,
        }}
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

/** "Select all", "only selected" toggle and sort order. */
export function BulkTaskListToolbar({
  selectionMode,
  allSelected,
  selectedCount,
  filteredCount,
  filterOnlySelected,
  sortOption,
  onToggleAll,
  onFilterOnlySelectedChange,
  onSortOptionChange,
}: {
  selectionMode: SelectionMode;
  allSelected: boolean;
  selectedCount: number;
  filteredCount: number;
  filterOnlySelected: boolean;
  sortOption: SortOption;
  onToggleAll: () => void;
  onFilterOnlySelectedChange: (value: boolean) => void;
  onSortOptionChange: (option: SortOption) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 bg-muted/10">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {selectionMode === "pick" && (
          <>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
              Chọn tất cả
            </label>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => onFilterOnlySelectedChange(!filterOnlySelected)}
                className={cn(
                  "cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors border",
                  filterOnlySelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:text-foreground border-border"
                )}
              >
                <Filter className="h-3 w-3" aria-hidden />
                {filterOnlySelected ? "Đang lọc: Chỉ hiện đã chọn" : "Chỉ hiện đã chọn"}
              </button>
            )}
          </>
        )}
        {selectionMode === "filter" && (
          <span className="text-xs text-muted-foreground font-medium">
            Danh sách task khớp bộ lọc
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
          <span className="text-xs text-muted-foreground hidden sm:inline">Sắp xếp:</span>
          <Select value={sortOption} onValueChange={(v) => onSortOptionChange(v as SortOption)}>
            <SelectTrigger className="h-7 w-[165px] text-xs bg-background">
              <SelectValue placeholder="Thứ tự mặc định" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Thứ tự mặc định</SelectItem>
              <SelectItem value="name-asc">Tên task (A → Z)</SelectItem>
              <SelectItem value="name-desc">Tên task (Z → A)</SelectItem>
              <SelectItem value="created-desc">Ngày tạo (Mới nhất)</SelectItem>
              <SelectItem value="created-asc">Ngày tạo (Cũ nhất)</SelectItem>
              <SelectItem value="updated-desc">Cập nhật gần nhất</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectionMode === "pick" && (
          <span className="text-xs text-muted-foreground font-medium shrink-0">
            Đã chọn {selectedCount} / {filteredCount}
          </span>
        )}
      </div>
    </div>
  );
}

export { BulkTaskRow, BulkTaskList } from "./bulk-task-list";

export function BulkTaskListFooter({
  filterProject,
  filteredCount,
  loadedCount,
  totalServerIssues,
  isLoadingMore,
  effectiveCount,
  onLoadMore,
}: {
  filterProject: string;
  filteredCount: number;
  loadedCount: number;
  totalServerIssues: number;
  isLoadingMore: boolean;
  effectiveCount: number;
  onLoadMore: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">
          Hiển thị {filteredCount} task (đã tải {loadedCount}/{totalServerIssues} của dự án {filterProject})
        </span>
        {loadedCount < totalServerIssues && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="h-6 text-[11px] px-2 py-0 cursor-pointer"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Đang tải...
              </>
            ) : (
              `Tải thêm (${totalServerIssues - loadedCount} task còn lại)`
            )}
          </Button>
        )}
      </div>
      <span className="font-semibold text-primary">Tổng số task sẽ cập nhật: {effectiveCount}</span>
    </div>
  );
}
