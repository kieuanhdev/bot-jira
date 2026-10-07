"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { staleKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/async-state";
import { CircleGauge, RefreshCw, UserRoundX, X } from "lucide-react";
import type { RequirementCode } from "@/lib/issues/standardization";
import { ALL, type FocusMode, type SortMode, type StaleResponse } from "./lib/stale-types";
import {
  sortTasks,
  computeFocusCounts,
  filterFocusedTasks,
  filterStdTasks,
  type StdMissingFilter,
  type StdSortMode,
  type StdStaleFilter,
} from "./lib/stale-utils";
import { JiraUsernameWarning, StandardizationMetricCards, StandardizationOverviewCard } from "./stale-std-overview";
import { StaleDataQualityCard, StaleWipCard } from "./stale-insight-cards";
import { StaleDeepDive, StaleDiagnosticsSection, StaleFocusSection } from "./stale-focus-sections";
import { StaleEmptyState } from "./stale-empty-state";
import { MyWorkHealthyState } from "./stale-my-work-healthy";
import { StaleScopeFilter } from "./stale-scope-filter";
import { StaleTaskListCard } from "./stale-task-list-card";
import { StaleViewSwitcher } from "./stale-view-switcher";
import { StandardizationFilterCard } from "./stale-std-filters";
import { StandardizationTaskList } from "./stale-std-task-list";
import { InsightBrief, ActionQueue } from "./stale-team-sections";

const STD_MISSING_VALUES: StdMissingFilter[] = ["ALL", "ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"];
const STD_STALE_VALUES: StdStaleFilter[] = ["ALL", "stale", "healthy"];
const STD_SORT_VALUES: StdSortMode[] = ["missing-desc", "stateAge-desc", "updated-desc", "key-asc"];

function pickOne<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function StaleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // Read URL query parameters
  const urlView = searchParams.get("view");
  const urlTab = searchParams.get("tab");

  const [viewMode, setViewMode] = useState<"my-work" | "team">(urlView === "team" ? "team" : "my-work");
  const [activeTab, setActiveTab] = useState<"standardization" | "stale">(
    urlTab === "stale" ? "stale" : "standardization"
  );

  const [project, setProject] = useState(ALL);
  const [assignee, setAssignee] = useState<string>(urlView === "team" ? ALL : "me");
  const [status, setStatus] = useState(ALL);
  const [reason, setReason] = useState(ALL);
  const [severity, setSeverity] = useState(ALL);
  const [focus, setFocus] = useState<FocusMode>("all");
  const [query, setQuery] = useState("");
  // Client-side drill-down from "Nơi cần hỗ trợ": narrows the lists without refetching.
  const [supportAssignee, setSupportAssignee] = useState<string | null>(null);
  const [bottleneckStatus, setBottleneckStatus] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [visibleCount, setVisibleCount] = useState(50);

  // Standardization filters & selection
  // Initial values come from the URL so a filtered queue can be shared / survives a reload.
  const [stdMissingFilter, setStdMissingFilter] = useState<StdMissingFilter>(
    pickOne(searchParams.get("miss"), STD_MISSING_VALUES, "ALL")
  );
  const [stdProjectFilter, setStdProjectFilter] = useState(searchParams.get("proj") || ALL);
  const [stdStatusFilter, setStdStatusFilter] = useState(ALL);
  const [stdStaleFilter, setStdStaleFilter] = useState<StdStaleFilter>(
    pickOne(searchParams.get("sla"), STD_STALE_VALUES, "ALL")
  );
  const [stdSearch, setStdSearch] = useState(searchParams.get("q") ?? "");
  const [stdSort, setStdSort] = useState<StdSortMode>(
    pickOne(searchParams.get("sort"), STD_SORT_VALUES, "missing-desc")
  );
  const [selectedStdTasks, setSelectedStdTasks] = useState<Set<string>>(new Set());

  // Update URL helper
  const updateUrl = (nextView: "my-work" | "team", nextTab?: "standardization" | "stale") => {
    const p = new URLSearchParams(window.location.search);
    p.set("view", nextView);
    if (nextView === "my-work") {
      p.set("tab", nextTab ?? activeTab);
    } else {
      p.delete("tab");
    }
    router.replace(`/stale?${p.toString()}`, { scroll: false });
  };

  // Mirror the standardization filters into the URL (default values are omitted; search is debounced).
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const sync = (key: string, value: string, fallback: string) => {
        if (value && value !== fallback) p.set(key, value);
        else p.delete(key);
      };
      sync("miss", stdMissingFilter, "ALL");
      sync("proj", stdProjectFilter, ALL);
      sync("sla", stdStaleFilter, "ALL");
      sync("sort", stdSort, "missing-desc");
      sync("q", stdSearch.trim(), "");
      const next = p.toString();
      if (next !== window.location.search.replace(/^\?/, "")) {
        router.replace(next ? `/stale?${next}` : "/stale", { scroll: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [stdMissingFilter, stdProjectFilter, stdStaleFilter, stdSort, stdSearch, router]);

  const handleViewModeChange = (mode: "my-work" | "team") => {
    setViewMode(mode);
    setAssignee(mode === "my-work" ? "me" : ALL);
    setVisibleCount(50);
    updateUrl(mode, activeTab);
  };

  const handleTabChange = (tab: "standardization" | "stale") => {
    setActiveTab(tab);
    updateUrl("my-work", tab);
  };

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
    refetchInterval: 60_000,
    retry: 1,
  });

  const focusedTasks = useMemo(() => {
    let tasks = filterFocusedTasks(data?.tasks ?? [], focus, query);
    if (supportAssignee) tasks = tasks.filter((task) => task.assigneeJira === supportAssignee);
    if (bottleneckStatus) tasks = tasks.filter((task) => task.status === bottleneckStatus);
    return tasks;
  }, [data?.tasks, focus, query, supportAssignee, bottleneckStatus]);

  const sortedTasks = useMemo(() => sortTasks(focusedTasks, sortMode), [focusedTasks, sortMode]);
  const visibleTasks = sortedTasks.slice(0, visibleCount);
  const priorityTasks = useMemo(() => sortTasks(focusedTasks, "priority"), [focusedTasks]);
  const hasServerFilters = [project, assignee, status, reason, severity].some((value) => value !== ALL);
  const hasAnyFilter = hasServerFilters || focus !== "all" || query.trim().length > 0 || supportAssignee !== null || bottleneckStatus !== null;

  const clearFilters = () => {
    setProject(ALL);
    if (viewMode === "my-work") {
      setAssignee("me");
    } else {
      setAssignee(ALL);
    }
    setStatus(ALL);
    setReason(ALL);
    setSeverity(ALL);
    setFocus("all");
    setQuery("");
    setSupportAssignee(null);
    setBottleneckStatus(null);
    setVisibleCount(50);
  };

  const scrollToDetailList = () =>
    requestAnimationFrame(() =>
      document.getElementById("stale-detail-list")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );

  const selectSupportAssignee = (name: string) => {
    // "Chưa phân công" lens and a named assignee are mutually exclusive; combining them yields an empty list.
    if (focus === "unassigned") setFocus("all");
    setSupportAssignee((current) => (current === name ? null : name));
    setVisibleCount(50);
    scrollToDetailList();
  };

  const selectBottleneckStatus = (name: string) => {
    setBottleneckStatus((current) => (current === name ? null : name));
    setVisibleCount(50);
    scrollToDetailList();
  };

  const selectFocus = (next: FocusMode) => {
    if (next === "unassigned") setSupportAssignee(null);
    setFocus((current) => (current === next ? "all" : next));
    setVisibleCount(50);
  };

  const summary = data?.summary;
  const staleRate =
    summary && summary.totalActive > 0 ? Math.round((summary.totalStale / summary.totalActive) * 100) : 0;
  const focusCounts = computeFocusCounts(data?.tasks);

  // Standardization filtered list
  const standardizationSummary = data?.myWork?.standardization;
  const allStdTasks = useMemo(
    () => standardizationSummary?.tasks ?? [],
    [standardizationSummary?.tasks]
  );

  const filteredStdTasks = useMemo(
    () =>
      filterStdTasks(allStdTasks, {
        missing: stdMissingFilter,
        project: stdProjectFilter,
        status: stdStatusFilter,
        stale: stdStaleFilter,
        search: stdSearch,
        sort: stdSort,
      }),
    [allStdTasks, stdMissingFilter, stdProjectFilter, stdStatusFilter, stdStaleFilter, stdSearch, stdSort]
  );

  const hasStdFilters =
    stdMissingFilter !== "ALL" ||
    stdProjectFilter !== ALL ||
    stdStatusFilter !== ALL ||
    stdStaleFilter !== "ALL" ||
    stdSearch.trim().length > 0;

  const clearStdFilters = () => {
    setStdMissingFilter("ALL");
    setStdProjectFilter(ALL);
    setStdStatusFilter(ALL);
    setStdStaleFilter("ALL");
    setStdSearch("");
    setStdSort("missing-desc");
  };

  const handleSelectAllStd = (checked: boolean) => {
    if (checked) {
      setSelectedStdTasks(new Set(filteredStdTasks.map((t) => t.jiraKey)));
    } else {
      setSelectedStdTasks(new Set());
    }
  };

  const toggleSelectStd = (key: string) => {
    setSelectedStdTasks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalActive = data?.myWork?.totalActive ?? 0;
  const incompleteCount = standardizationSummary?.incomplete ?? 0;
  const completeCount = standardizationSummary?.complete ?? 0;
  const missingCounts = standardizationSummary?.missingCounts ?? {
    ESTIMATION: 0,
    WORKLOG: 0,
    FIX_VERSION: 0,
    DUE_DATE: 0,
  };
  const completePercent = totalActive > 0 ? Math.round((completeCount / totalActive) * 100) : 100;

  // Scope filter handlers: any change resets pagination.
  const handleProjectChange = (value: string) => {
    setProject(value);
    setVisibleCount(50);
  };

  const handleAssigneeChange = (value: string) => {
    setAssignee(value);
    if (value === "me") {
      setViewMode("my-work");
      updateUrl("my-work", activeTab);
    } else if (viewMode === "my-work") {
      setViewMode("team");
      updateUrl("team");
    }
    setVisibleCount(50);
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setVisibleCount(50);
  };

  const handleReasonChange = (value: string) => {
    setReason(value);
    setVisibleCount(50);
  };

  const handleSeverityChange = (value: string) => {
    setSeverity(value);
    setVisibleCount(50);
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setVisibleCount(50);
  };

  const toggleStdMissingFilter = (code: RequirementCode) =>
    setStdMissingFilter((prev) => (prev === code ? "ALL" : code));

  const handleFilterToSingleProject = (projectKey: string) => {
    setStdProjectFilter(projectKey);
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
        incompleteCount={incompleteCount}
        onViewModeChange={handleViewModeChange}
        onTabChange={handleTabChange}
      />

      {/* Scope filter only drives the SLA analysis; the standardization queue has its own filter bar. */}
      {(viewMode === "team" || activeTab === "stale") && (
      <StaleScopeFilter
        project={project}
        assignee={assignee}
        status={status}
        reason={reason}
        severity={severity}
        data={data}
        jiraUsername={session?.user?.jiraUsername}
        onProjectChange={handleProjectChange}
        onAssigneeChange={handleAssigneeChange}
        onStatusChange={handleStatusChange}
        onReasonChange={handleReasonChange}
        onSeverityChange={handleSeverityChange}
        onReset={clearFilters}
      />
      )}

      {/* Loading Skeletons */}
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

      {/* Error Card */}
      {!isLoading && error && !data && (
        <ErrorState
          title="Không thể tải dữ liệu phân tích tồn đọng"
          message={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      )}

      {/* VIEW: MY WORK -> TAB: STANDARDIZATION */}
      {data && viewMode === "my-work" && activeTab === "standardization" && (
        <div className="flex flex-col gap-5">
          {/* Unconfigured Jira Username warning */}
          {!session?.user?.jiraUsername && !data.myWork?.username && <JiraUsernameWarning />}

          {/* Standardization Overview Card */}
          <StandardizationOverviewCard
            allStdTasks={allStdTasks}
            selectedStdTasks={selectedStdTasks}
            incompleteCount={incompleteCount}
            completeCount={completeCount}
            totalActive={totalActive}
            completePercent={completePercent}
            lastSyncedAt={data?.myWork?.lastSyncedAt}
            onFilterToSingleProject={handleFilterToSingleProject}
          />

          {/* 4 Interactive Metric Breakdown Cards */}
          <StandardizationMetricCards
            missingCounts={missingCounts}
            stdMissingFilter={stdMissingFilter}
            onToggle={toggleStdMissingFilter}
          />

          {/* Filter Bar for Standardization Queue */}
          <StandardizationFilterCard
            stdSearch={stdSearch}
            stdProjectFilter={stdProjectFilter}
            stdStaleFilter={stdStaleFilter}
            stdSort={stdSort}
            projects={data?.filters.projects ?? []}
            hasStdFilters={hasStdFilters}
            onSearchChange={setStdSearch}
            onProjectChange={setStdProjectFilter}
            onStaleChange={setStdStaleFilter}
            onSortChange={setStdSort}
            onClear={clearStdFilters}
          />

          {/* Standardization Task List Card */}
          <StandardizationTaskList
            filteredStdTasks={filteredStdTasks}
            allStdTasks={allStdTasks}
            selectedStdTasks={selectedStdTasks}
            incompleteCount={incompleteCount}
            totalActive={totalActive}
            hasStdFilters={hasStdFilters}
            onFilterToSingleProject={handleFilterToSingleProject}
            onClearFilters={clearStdFilters}
            onViewStale={() => handleTabChange("stale")}
            onToggleSelect={toggleSelectStd}
            onSelectAll={handleSelectAllStd}
            onClearSelection={() => setSelectedStdTasks(new Set())}
          />
        </div>
      )}

      {/* VIEW: MY WORK -> TAB: STALE OR VIEW: TEAM */}
      {data && summary && (viewMode === "team" || activeTab === "stale") && (
        <>
          <InsightBrief data={data} staleRate={staleRate} />

          {data.tasks.length > 0 && (
            <>
              <StaleFocusSection
                focus={focus}
                focusCounts={focusCounts}
                onClearFocus={() => setFocus("all")}
                onSelectFocus={selectFocus}
              />

              <ActionQueue tasks={priorityTasks} focus={focus} />

              <StaleDeepDive>
              <StaleDiagnosticsSection
                data={data}
                focus={focus}
                bottleneckStatus={bottleneckStatus}
                onSelectStatus={selectBottleneckStatus}
                supportAssignee={supportAssignee}
                onSelectAssignee={selectSupportAssignee}
                onSelectFocus={(mode) => {
                  selectFocus(mode);
                  scrollToDetailList();
                }}
              />

              <div className="grid gap-4 lg:grid-cols-2">
                <StaleWipCard wip={data.wip} />
                <StaleDataQualityCard summary={summary} tasks={data.tasks} />
              </div>
              </StaleDeepDive>

              {/* Detailed Stale Task List */}
              <div id="stale-detail-list" className="scroll-mt-4 space-y-3">
              {(supportAssignee || bottleneckStatus) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Đang lọc:</span>
                  {[
                    supportAssignee && { label: `Người xử lý: ${supportAssignee}`, clear: () => setSupportAssignee(null) },
                    bottleneckStatus && { label: `Trạng thái: ${bottleneckStatus}`, clear: () => setBottleneckStatus(null) },
                  ]
                    .filter((chip): chip is { label: string; clear: () => void } => Boolean(chip))
                    .map((chip) => (
                      <Badge key={chip.label} variant="outline" className="gap-1 font-medium">
                        {chip.label}
                        <button
                          type="button"
                          onClick={chip.clear}
                          aria-label={`Bỏ lọc ${chip.label}`}
                          className="cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </Badge>
                    ))}
                </div>
              )}
              <StaleTaskListCard
                visibleTasks={visibleTasks}
                focusedCount={focusedTasks.length}
                totalCount={data.tasks.length}
                sortedCount={sortedTasks.length}
                visibleCount={visibleCount}
                query={query}
                sortMode={sortMode}
                onQueryChange={handleQueryChange}
                onSortModeChange={setSortMode}
                onShowMore={() => setVisibleCount((count) => count + 50)}
                onClearFilters={clearFilters}
              />
              </div>

              <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <UserRoundX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Các góc nhìn theo người xử lý chỉ phục vụ điều phối hỗ trợ và tháo gỡ điểm nghẽn. Không sử dụng chúng như bảng xếp hạng hiệu suất cá nhân.
              </p>
            </>
          )}

          {data.tasks.length === 0 && (
            viewMode === "my-work" &&
            [status, reason, severity].every((v) => v === ALL) &&
            !query.trim() &&
            focus === "all" ? (
              <MyWorkHealthyState
                myWork={data.myWork}
                onViewTeam={() => handleViewModeChange("team")}
                onViewStandardization={() => handleTabChange("standardization")}
              />
            ) : (
              <StaleEmptyState filtered={hasAnyFilter} onClear={clearFilters} />
            )
          )}
        </>
      )}
    </div>
  );
}
