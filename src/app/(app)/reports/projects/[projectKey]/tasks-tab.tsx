"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys, meKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationFooter } from "@/components/shared/pagination-footer";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type {
  ProjectTasksResponse,
  ReportPeriod,
  ReportStatusGroup,
} from "@/lib/reports/types";
import { useProjectMembers } from "./lib/use-project-members";
import { ActivityPills, BASE_ACTIVITY_FILTERS } from "./tasks-tab/activity-pills";
import { ActiveFilterBanner } from "./tasks-tab/active-filter-banner";
import { TasksToolbar } from "./tasks-tab/tasks-toolbar";
import { ReportTasksTable } from "./tasks-tab/report-tasks-table";

export interface TasksTabProps {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
  activity?: string;
  statusGroup?: ReportStatusGroup | null;
  assignee?: string;
  search?: string;
  offset?: number;
  onActivityChange?: (activity: string) => void;
  onStatusGroupChange?: (statusGroup: ReportStatusGroup | null | "all") => void;
  onAssigneeChange?: (assignee: string) => void;
  onSearchChange?: (search: string) => void;
  onOffsetChange?: (offset: number) => void;
  onResetFilters?: () => void;
  onNavigateToOverview?: () => void;
}

export function TasksTab({
  projectKey,
  period,
  versionId,
  activity = "all",
  statusGroup = null,
  assignee = "all",
  search = "",
  offset = 0,
  onActivityChange,
  onStatusGroupChange,
  onAssigneeChange,
  onSearchChange,
  onOffsetChange,
  onResetFilters,
  onNavigateToOverview,
}: TasksTabProps) {
  const limit = 20;
  const isVersionScope = Boolean(versionId && versionId !== "all");

  // Local immediate state for search input to ensure fluid typing
  const [searchInput, setSearchInput] = useState(search);
  const [prevSearchProp, setPrevSearchProp] = useState(search);
  if (search !== prevSearchProp) {
    setPrevSearchProp(search);
    setSearchInput(search);
  }

  // 300ms debounce before search affects queryKey and URL
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch.trim() !== search.trim()) {
      onSearchChange?.(debouncedSearch.trim());
    }
  }, [debouncedSearch, search, onSearchChange]);

  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    staleTime: 5 * 60 * 1000,
  });
  const jiraBaseUrl = meStatus?.jiraBaseUrl;

  const memberParams = useMemo(() => {
    const params: Record<string, string> = { timezone: period.timezone };
    if (!isVersionScope) {
      params.period = period.preset;
      params.from = period.from;
      params.to = period.to;
    }
    if (versionId && versionId !== "all") params.versionId = versionId;
    return params;
  }, [period, isVersionScope, versionId]);

  // Shared members query
  const { data: membersData } = useProjectMembers(projectKey, memberParams);

  const taskParams = useMemo(() => {
    const params: Record<string, string> = {
      timezone: period.timezone,
      limit: String(limit),
      offset: String(offset),
    };
    if (!isVersionScope) {
      params.period = period.preset;
      params.from = period.from;
      params.to = period.to;
    }
    if (versionId && versionId !== "all") params.versionId = versionId;
    if (activity !== "all") params.activity = activity;
    if (statusGroup) params.statusGroup = statusGroup;
    if (assignee !== "all") params.assignee = assignee;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    return params;
  }, [period, isVersionScope, versionId, activity, statusGroup, assignee, debouncedSearch, offset]);

  const { data, isLoading, isError, refetch } = useQuery<ProjectTasksResponse>({
    queryKey: reportsKeys.tasks(projectKey, taskParams),
    queryFn: () => {
      const sp = new URLSearchParams(taskParams);
      return api<ProjectTasksResponse>(`/api/reports/projects/${projectKey}/tasks?${sp.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.reports.tasks.staleTime,
    gcTime: queryPolicy.reports.tasks.gcTime,
  });

  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit) || 1;

  const activeActivityLabel = BASE_ACTIVITY_FILTERS.find((f) => f.id === activity)?.label;
  const activeMemberName =
    assignee === "unassigned"
      ? "Chưa phân công"
      : membersData?.members.find((m) => m.assignee === assignee)?.displayName || assignee;

  return (
    <div className="space-y-4">
      {/* Back to overview / member link */}
      {onNavigateToOverview && (
        <div className="flex items-center justify-between -mb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNavigateToOverview}
            className="h-7 -ml-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {assignee !== "all"
                ? `Quay lại ${activeMemberName}`
                : "Quay lại Tổng quan"}
            </span>
          </Button>
        </div>
      )}

      {/* Active Filters Alert Banner */}
      <ActiveFilterBanner
        activity={activity}
        statusGroup={statusGroup}
        assignee={assignee}
        search={searchInput}
        activeActivityLabel={activeActivityLabel}
        activeMemberName={activeMemberName}
        onClearActivity={() => onActivityChange?.("all")}
        onClearStatusGroup={() => onStatusGroupChange?.(null)}
        onClearAssignee={() => onAssigneeChange?.("all")}
        onClearSearch={() => {
          setSearchInput("");
          onSearchChange?.("");
        }}
        onResetFilters={() => {
          setSearchInput("");
          onResetFilters?.();
        }}
        onNavigateToOverview={onNavigateToOverview}
      />

      {/* Activity Filter Pills */}
      <ActivityPills
        activity={activity}
        isVersionScope={isVersionScope}
        onActivityChange={(nextActivity) => onActivityChange?.(nextActivity)}
      />

      {/* Search and Secondary Filters */}
      <TasksToolbar
        search={searchInput}
        onSearchChange={(nextSearch) => setSearchInput(nextSearch)}
        statusGroup={statusGroup || "all"}
        onStatusGroupChange={(nextGroup) => onStatusGroupChange?.(nextGroup as ReportStatusGroup)}
        assignee={assignee}
        onAssigneeChange={(nextAssignee) => onAssigneeChange?.(nextAssignee)}
        members={membersData?.members || []}
        total={total}
      />

      {/* Table Content / Loading / Error / Empty */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title="Không thể tải danh sách công việc"
          message="Vui lòng thử lại sau."
          onRetry={() => refetch()}
        />
      ) : !data?.tasks || data.tasks.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Không tìm thấy task phù hợp"
          hint="Thử thay đổi bộ lọc hoạt động, nhóm trạng thái hoặc tìm kiếm từ khóa khác."
          className="bg-card"
        />
      ) : (
        <ReportTasksTable
          tasks={data.tasks}
          isVersionScope={isVersionScope}
          jiraBaseUrl={jiraBaseUrl}
        />
      )}

      {/* Pagination */}
      <PaginationFooter
        page={currentPage}
        totalPages={totalPages}
        totalItems={total}
        itemLabel="task"
        onPageChange={(newPage) => onOffsetChange?.((newPage - 1) * limit)}
      />
    </div>
  );
}
