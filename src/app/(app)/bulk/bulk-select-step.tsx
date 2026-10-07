import { IssueFilterBar } from "@/components/issues/issue-filter-bar";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { IssueItem } from "@/hooks/use-issues";
import { DEFAULT_BULK_FILTERS, type IssueFilters } from "@/lib/issues/issue-filters";
import { cn } from "@/lib/utils";
import {
  ArrowUpDown,
  Clock,
  ExternalLink,
  Filter,
  ListChecks,
  Loader2,
  Search,
} from "lucide-react";
import type { SelectionMode, SortOption } from "./lib/bulk-logic";
import { CATEGORY_TEXT } from "./lib/bulk-types";
import { categoryOf, statusDot } from "./lib/bulk-utils";

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

/** Selection mode, filter bar and match summary. */
export function BulkTaskFilters({
  filterProject,
  selectionMode,
  taskFilters,
  availableAssignees,
  statusOptions,
  epicOptions,
  labelOptions,
  priorityOptions,
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
  myName: string | null | undefined;
  filteredCount: number;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onTaskFiltersChange: (filters: IssueFilters) => void;
}) {
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
        options={{
          assignees: availableAssignees,
          statuses: statusOptions,
          epics: epicOptions,
          labels: labelOptions,
          priorities: priorityOptions,
        }}
        capabilities={{
          search: true,
          assignee: "multi",
          status: "multi",
          epic: "multi",
          label: "multi",
          priority: "multi",
          quickSwitch: false,
        }}
        myName={myName}
        searchPlaceholder={`Tìm kiếm trong ${filterProject}…`}
        collapseExtras
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

export function BulkTaskRow({
  issue: i,
  isChecked,
  isStandardizing,
  selectionMode,
  jiraBaseUrl,
  onToggle,
}: {
  issue: IssueItem;
  isChecked: boolean;
  isStandardizing: boolean;
  selectionMode: SelectionMode;
  jiraBaseUrl: string;
  onToggle: (key: string) => void;
}) {
  const cat = categoryOf(i.status, i.statusCategory);
  const dot = statusDot(i.status, cat);

  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b border-l-[3px] px-3 py-2 text-sm last:border-b-0 hover:bg-accent/50",
        cat === "new" && "border-l-sky-500/60",
        cat === "indeterminate" && "border-l-primary/60",
        cat === "done" && "border-l-emerald-500/60",
        isChecked && "bg-accent/40",
        isStandardizing && "bg-primary/5 dark:bg-primary/10"
      )}
    >
      <Checkbox
        checked={isChecked}
        disabled={selectionMode === "filter"}
        onCheckedChange={() => onToggle(i.jiraKey)}
        aria-label={`Chọn ${i.jiraKey}`}
      />
      {jiraBaseUrl ? (
        <a
          href={`${jiraBaseUrl}/browse/${i.jiraKey}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="group/link inline-flex w-24 shrink-0 items-center gap-1 font-mono text-xs text-primary hover:underline"
          title={`Mở ${i.jiraKey} trên Jira`}
        >
          {i.jiraKey}
          <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
        </a>
      ) : (
        <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
      )}
      {isStandardizing && (
        <Badge
          variant="secondary"
          className="text-[10px] py-0 px-1.5 h-4 shrink-0 font-medium bg-primary/15 text-primary border-primary/20"
        >
          Chuẩn hóa
        </Badge>
      )}
      <span className="min-w-0 flex-1 truncate">{i.summary}</span>
      {i.epic && (
        <span
          className="hidden sm:inline-flex shrink-0 items-center rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
          title={`Epic: ${i.epic}`}
        >
          {i.epic}
        </span>
      )}
      {i.createdAt && (
        <span
          className="hidden md:inline-flex shrink-0 items-center text-[11px] text-muted-foreground tabular-nums"
          title={`Ngày tạo: ${new Date(i.createdAt).toLocaleString("vi-VN")}`}
        >
          <Clock className="h-3 w-3 mr-1 opacity-60" aria-hidden />
          {new Date(i.createdAt).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
      )}
      <span
        className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground max-w-[130px] truncate"
        title={i.assigneeJira ? `Người phụ trách: @${i.assigneeJira}` : "Chưa giao"}
      >
        {i.assigneeJira ? `@${i.assigneeJira}` : "Chưa giao"}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
        <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />
        <span className={CATEGORY_TEXT[cat]}>{i.status}</span>
      </span>
      {i.points != null && (
        <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-secondary px-1.5 font-mono text-[10px] font-semibold tabular-nums text-secondary-foreground">
          {i.points}pt
        </span>
      )}
    </label>
  );
}

export function BulkTaskList({
  isIssuesLoading,
  filteredIssues,
  selectionMode,
  selected,
  initialKeysSet,
  jiraBaseUrl,
  onToggle,
}: {
  isIssuesLoading: boolean;
  filteredIssues: IssueItem[];
  selectionMode: SelectionMode;
  selected: Set<string>;
  initialKeysSet: Set<string>;
  jiraBaseUrl: string;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="max-h-80 overflow-auto">
      {isIssuesLoading && (
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}
      {filteredIssues.map((i) => (
        <BulkTaskRow
          key={i.jiraKey}
          issue={i}
          isChecked={selectionMode === "filter" || selected.has(i.jiraKey)}
          isStandardizing={initialKeysSet.has(i.jiraKey)}
          selectionMode={selectionMode}
          jiraBaseUrl={jiraBaseUrl}
          onToggle={onToggle}
        />
      ))}
      {!isIssuesLoading && filteredIssues.length === 0 && (
        <div className="flex flex-col items-center p-10 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">Không tìm thấy task phù hợp</p>
          <p className="mt-1 text-xs text-muted-foreground">Xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái/người phụ trách khác.</p>
        </div>
      )}
    </div>
  );
}

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
