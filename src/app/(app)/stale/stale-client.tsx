"use client";

import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { staleKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/async-state";
import { CircleGauge, RefreshCw } from "lucide-react";
import { ALL, type StaleResponse } from "./lib/stale-types";
import { filterStdTasks } from "./lib/stale-utils";
import { StaleScopeFilter } from "./stale-scope-filter";
import { StaleViewSwitcher } from "./stale-view-switcher";
import { StandardizationView } from "./stale-standardization-view";
import { StaleAnalysisView } from "./stale-analysis-view";
import { TEAM_VIEW_ENABLED } from "./lib/stale-flags";
import { useStaleUrlState } from "./hooks/use-stale-url-state";

export function StaleClient() {
  const { data: session } = useSession();
  const urlState = useStaleUrlState();
  const { viewMode, activeTab, project, assignee, status, reason, severity } = urlState;

  const [selectedStdTasks, setSelectedStdTasks] = useState<Set<string>>(new Set());

  // Scope query parameters
  const params = new URLSearchParams();
  if (project !== ALL) params.set("project", project);
  if (assignee !== ALL) params.set("assignee", assignee);
  if (status !== ALL) params.set("status", status);
  if (reason !== ALL) params.set("reason", reason);
  if (severity !== ALL) params.set("severity", severity);
  const queryString = params.toString();

  const { data, dataUpdatedAt, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: staleKeys.list(project, assignee, status, reason, severity),
    queryFn: () => api<StaleResponse>(`/api/stale${queryString ? `?${queryString}` : ""}`),
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.staleIssues.staleTime,
    gcTime: queryPolicy.staleIssues.gcTime,
    refetchInterval: 60_000,
    retry: 1,
  });

  // Standardization tasks & filtering
  const allStdTasks = useMemo(
    () => data?.myWork?.standardization?.tasks ?? [],
    [data?.myWork?.standardization?.tasks]
  );

  const filteredStdTasks = useMemo(
    () =>
      filterStdTasks(allStdTasks, {
        missing: urlState.stdMissingFilter,
        project: urlState.stdProjectFilter,
        status: urlState.stdStatusFilter,
        stale: urlState.stdStaleFilter,
        search: urlState.stdSearch,
        sort: urlState.stdSort,
      }),
    [
      allStdTasks,
      urlState.stdMissingFilter,
      urlState.stdProjectFilter,
      urlState.stdStatusFilter,
      urlState.stdStaleFilter,
      urlState.stdSearch,
      urlState.stdSort,
    ]
  );

  // Prune selected tasks during render so selections outside current filtered view are not retained
  const filteredKeysSet = useMemo(() => new Set(filteredStdTasks.map((t) => t.jiraKey)), [filteredStdTasks]);
  const activeSelectedKeys = useMemo(() => {
    const next = new Set<string>();
    for (const key of selectedStdTasks) {
      if (filteredKeysSet.has(key)) next.add(key);
    }
    return next;
  }, [selectedStdTasks, filteredKeysSet]);

  const handleSelectAllStd = (checked: boolean) => {
    setSelectedStdTasks(checked ? new Set(filteredStdTasks.map((t) => t.jiraKey)) : new Set());
  };

  const toggleSelectStd = (key: string) => {
    setSelectedStdTasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleFilterToSingleProject = (projectKey: string) => {
    urlState.setStdProjectFilter(projectKey);
    setSelectedStdTasks(
      new Set(
        allStdTasks
          .filter((t) => t.projectKey === projectKey && selectedStdTasks.has(t.jiraKey))
          .map((t) => t.jiraKey)
      )
    );
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader
        eyebrow="Sức khỏe luồng công việc"
        icon={CircleGauge}
        title="Task cần xử lý"
        description="Task thiếu dữ liệu chuẩn hoặc vượt SLA — xử lý từng việc để tháo gỡ điểm nghẽn."
        meta={
          dataUpdatedAt > 0 ? (
            <span className="hidden sm:inline">
              Cập nhật lúc{" "}
              {new Date(dataUpdatedAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : undefined
        }
        actions={
          <Button
            className="cursor-pointer"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Làm mới dữ liệu phân tích"
          >
            <RefreshCw className={cn(isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden /> Làm mới
          </Button>
        }
      />

      <StaleViewSwitcher
        viewMode={viewMode}
        activeTab={activeTab}
        data={data}
        incompleteCount={data?.myWork?.standardization?.incomplete ?? 0}
        onViewModeChange={urlState.setViewMode}
        onTabChange={urlState.setActiveTab}
      />

      {(viewMode === "team" || activeTab === "stale") && (
        <StaleScopeFilter
          project={project}
          assignee={assignee}
          status={status}
          reason={reason}
          severity={severity}
          data={data}
          jiraUsername={session?.user?.jiraUsername}
          onProjectChange={urlState.setProject}
          onAssigneeChange={urlState.setAssignee}
          onStatusChange={urlState.setStatus}
          onReasonChange={urlState.setReason}
          onSeverityChange={urlState.setSeverity}
          onReset={urlState.clearScopeFilters}
        />
      )}

      {isLoading && (
        <>
          <Skeleton className="h-64 rounded-lg" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-36 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </>
      )}

      {!isLoading && error && !data && (
        <ErrorState
          title="Không thể tải dữ liệu phân tích tồn đọng"
          message={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      )}

      {data && viewMode === "my-work" && activeTab === "standardization" && (
        <StandardizationView
          data={data}
          hasJiraUsername={Boolean(session?.user?.jiraUsername)}
          allStdTasks={allStdTasks}
          filteredStdTasks={filteredStdTasks}
          selectedStdTasks={activeSelectedKeys}
          urlState={urlState}
          onFilterToSingleProject={handleFilterToSingleProject}
          onToggleSelect={toggleSelectStd}
          onSelectAll={handleSelectAllStd}
          onClearSelection={() => setSelectedStdTasks(new Set())}
        />
      )}

      {data && data.summary && (viewMode === "team" || activeTab === "stale") && (
        <StaleAnalysisView
          data={data}
          viewMode={viewMode}
          status={status}
          reason={reason}
          severity={severity}
          hasServerFilters={urlState.hasServerFilters}
          onClearScopeFilters={urlState.clearScopeFilters}
          onViewTeam={TEAM_VIEW_ENABLED ? () => urlState.setViewMode("team") : undefined}
          onViewStandardization={() => urlState.setActiveTab("standardization")}
        />
      )}
    </div>
  );
}
