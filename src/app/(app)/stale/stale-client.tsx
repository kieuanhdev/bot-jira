"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { staleKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/async-state";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock,
  Clock3,
  Filter,
  Layers,
  ListChecks,
  ListTodo,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  User,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
import {
  type RequirementCode,
  REQUIREMENT_LABELS,
  formatMissingSummary,
} from "@/lib/issues/standardization";
import {
  ALL,
  GROUP_DOT,
  ACTION_BY_REASON,
  type SortMode,
  type FocusMode,
  type StaleResponse,
} from "./lib/stale-types";
import {
  sortTasks,
  matchesFocus,
  formatTimeSpent,
  formatDueDate,
  buildMissingBulkFields,
  getEstimationMissingLabel,
} from "./lib/stale-utils";
import { SeverityBadge, TaskMeta, GreenCheck } from "./stale-task-meta";
import { BulkStandardizationAction } from "./stale-standardization-action";
import { MyWorkHealthyState } from "./stale-my-work-healthy";
import { FocusCard, InsightBrief, ActionQueue, AgingDistribution } from "./stale-team-sections";

function StaleEmptyState({
  filtered,
  onClear,
  title,
  hint,
}: {
  filtered: boolean;
  onClear?: () => void;
  title?: string;
  hint?: string;
}) {
  return (
    <EmptyState
      icon={filtered ? Search : GreenCheck}
      title={title ?? (filtered ? "Không có task phù hợp với lăng kính này" : "Luồng công việc đang trong giới hạn")}
      hint={hint ?? (filtered ? "Thử đổi phạm vi, từ khóa hoặc xóa bộ lọc để xem toàn bộ task vượt SLA." : "Không có task hoạt động nào vượt SLA theo trạng thái trong phạm vi hiện tại.")}
      action={
        filtered && onClear ? (
          <Button className="cursor-pointer" variant="outline" size="sm" onClick={onClear}>
            <RotateCcw aria-hidden className="h-3.5 w-3.5 mr-1.5" /> Xóa bộ lọc
          </Button>
        ) : undefined
      }
    />
  );
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
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [visibleCount, setVisibleCount] = useState(50);

  // Standardization filters & selection
  const [stdMissingFilter, setStdMissingFilter] = useState<"ALL" | RequirementCode>("ALL");
  const [stdProjectFilter, setStdProjectFilter] = useState(ALL);
  const [stdStatusFilter, setStdStatusFilter] = useState(ALL);
  const [stdStaleFilter, setStdStaleFilter] = useState<"ALL" | "stale" | "healthy">("ALL");
  const [stdSearch, setStdSearch] = useState("");
  const [stdSort, setStdSort] = useState<"missing-desc" | "stateAge-desc" | "updated-desc" | "key-asc">("missing-desc");
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
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return (data?.tasks ?? []).filter(
      (task) =>
        matchesFocus(task, focus) &&
        (!normalizedQuery ||
          [task.jiraKey, task.summary, task.status, task.assigneeJira ?? "", task.staleReasonLabel, task.projectKey].some(
            (value) => value.toLocaleLowerCase("vi").includes(normalizedQuery)
          ))
    );
  }, [data?.tasks, focus, query]);

  const sortedTasks = useMemo(() => sortTasks(focusedTasks, sortMode), [focusedTasks, sortMode]);
  const visibleTasks = sortedTasks.slice(0, visibleCount);
  const priorityTasks = useMemo(() => sortTasks(focusedTasks, "priority"), [focusedTasks]);
  const hasServerFilters = [project, assignee, status, reason, severity].some((value) => value !== ALL);
  const hasAnyFilter = hasServerFilters || focus !== "all" || query.trim().length > 0;

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
    setVisibleCount(50);
  };

  const selectFocus = (next: FocusMode) => {
    setFocus((current) => (current === next ? "all" : next));
    setVisibleCount(50);
  };

  const summary = data?.summary;
  const staleRate =
    summary && summary.totalActive > 0 ? Math.round((summary.totalStale / summary.totalActive) * 100) : 0;
  const focusCounts = {
    high: data?.tasks.filter((task) => matchesFocus(task, "high")).length ?? 0,
    blocked: data?.tasks.filter((task) => matchesFocus(task, "blocked")).length ?? 0,
    overdue: data?.tasks.filter((task) => matchesFocus(task, "overdue")).length ?? 0,
    unassigned: data?.tasks.filter((task) => matchesFocus(task, "unassigned")).length ?? 0,
  };

  // Standardization filtered list
  const standardizationSummary = data?.myWork?.standardization;
  const allStdTasks = useMemo(
    () => standardizationSummary?.tasks ?? [],
    [standardizationSummary?.tasks]
  );

  const filteredStdTasks = useMemo(() => {
    const q = stdSearch.trim().toLowerCase();
    return allStdTasks
      .filter((t) => {
        if (stdMissingFilter !== "ALL" && !t.missing.includes(stdMissingFilter)) return false;
        if (stdProjectFilter !== ALL && t.projectKey !== stdProjectFilter) return false;
        if (stdStatusFilter !== ALL && t.status !== stdStatusFilter) return false;
        if (stdStaleFilter === "stale" && !t.isStale) return false;
        if (stdStaleFilter === "healthy" && t.isStale) return false;
        if (q && ![t.jiraKey, t.summary, t.status, t.projectKey].some((s) => s.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => {
        if (stdSort === "missing-desc") {
          if (b.missing.length !== a.missing.length) return b.missing.length - a.missing.length;
          if (b.stateAgeDays !== a.stateAgeDays) return b.stateAgeDays - a.stateAgeDays;
          return a.jiraKey.localeCompare(b.jiraKey);
        }
        if (stdSort === "stateAge-desc") return b.stateAgeDays - a.stateAgeDays;
        if (stdSort === "updated-desc") {
          return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
        }
        return a.jiraKey.localeCompare(b.jiraKey);
      });
  }, [allStdTasks, stdMissingFilter, stdProjectFilter, stdStatusFilter, stdStaleFilter, stdSearch, stdSort]);

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

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <PageHeader
        eyebrow="Sức khỏe luồng công việc"
        icon={CircleGauge}
        title="Phân tích task tồn đọng"
        description="Biến cảnh báo vượt SLA và thiếu tiêu chuẩn dữ liệu thành kế hoạch hành động cụ thể để tháo gỡ điểm nghẽn."
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

      {/* Main View Switcher: Việc của tôi vs Toàn dự án */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" aria-label="Góc nhìn phân tích">
          <button
            type="button"
            aria-pressed={viewMode === "my-work"}
            onClick={() => handleViewModeChange("my-work")}
            className={cn(
              "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
              viewMode === "my-work"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            Việc của tôi
            {data?.myWork && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
                  incompleteCount > 0 || data.myWork.totalStale > 0
                    ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                )}
              >
                {incompleteCount > 0 ? `${incompleteCount} thiếu chuẩn` : `${data.myWork.totalStale} tồn đọng`}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "team"}
            onClick={() => handleViewModeChange("team")}
            className={cn(
              "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
              viewMode === "team"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Toàn dự án
            {data?.summary && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {data.summary.totalStale}
              </span>
            )}
          </button>
        </div>

        {/* In My Work view: Secondary Content Tabs */}
        {viewMode === "my-work" && (
          <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" aria-label="Phân loại việc của tôi">
            <button
              type="button"
              aria-pressed={activeTab === "standardization"}
              onClick={() => handleTabChange("standardization")}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTab === "standardization"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Cần chuẩn hóa
              {incompleteCount > 0 ? (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {incompleteCount}
                </span>
              ) : (
                <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  Đạt chuẩn
                </span>
              )}
            </button>
            <button
              type="button"
              aria-pressed={activeTab === "stale"}
              onClick={() => handleTabChange("stale")}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
                activeTab === "stale"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Tồn đọng (SLA)
              {data?.myWork && (
                <span
                  className={cn(
                    "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
                    data.myWork.totalStale > 0
                      ? "bg-red-500/20 text-red-600 dark:text-red-400"
                      : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  )}
                >
                  {data.myWork.totalStale}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Global Project / Assignee Scope Filter */}
      <Card className="shadow-none">
        <CardContent className="p-4">
          <FilterBar
            activeCount={[project, assignee, status, reason, severity].filter((v) => v !== ALL).length}
            onReset={clearFilters}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden /> Phạm vi phân tích
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                value={project}
                onValueChange={(value) => {
                  setProject(value);
                  setVisibleCount(50);
                }}
              >
                <SelectTrigger className="cursor-pointer" aria-label="Lọc theo dự án">
                  <SelectValue placeholder="Tất cả dự án" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả dự án</SelectItem>
                  {(data?.filters.projects ?? []).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={assignee}
                onValueChange={(value) => {
                  setAssignee(value);
                  if (value === "me") {
                    setViewMode("my-work");
                    updateUrl("my-work", activeTab);
                  } else if (viewMode === "my-work") {
                    setViewMode("team");
                    updateUrl("team");
                  }
                  setVisibleCount(50);
                }}
              >
                <SelectTrigger className="cursor-pointer" aria-label="Lọc theo người xử lý">
                  <SelectValue placeholder="Tất cả người xử lý" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả người xử lý</SelectItem>
                  {session?.user?.jiraUsername && (
                    <SelectItem value="me">Của tôi (@{session.user.jiraUsername})</SelectItem>
                  )}
                  <SelectItem value="unassigned">Chưa phân công</SelectItem>
                  {(data?.filters.assignees ?? [])
                    .filter((item) => item !== session?.user?.jiraUsername)
                    .map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setVisibleCount(50);
                }}
              >
                <SelectTrigger className="cursor-pointer" aria-label="Lọc theo trạng thái">
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                  {(data?.filters.statuses ?? []).map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={reason}
                onValueChange={(value) => {
                  setReason(value);
                  setVisibleCount(50);
                }}
              >
                <SelectTrigger className="cursor-pointer" aria-label="Lọc theo nguyên nhân">
                  <SelectValue placeholder="Tất cả nguyên nhân" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả nguyên nhân</SelectItem>
                  {(data?.filters.reasons ?? []).map((item) => (
                    <SelectItem key={item} value={item}>
                      {data?.filters.reasonLabels[item] ?? item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={severity}
                onValueChange={(value) => {
                  setSeverity(value);
                  setVisibleCount(50);
                }}
              >
                <SelectTrigger className="cursor-pointer" aria-label="Lọc theo mức độ">
                  <SelectValue placeholder="Tất cả mức độ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả mức độ</SelectItem>
                  <SelectItem value="high">Khẩn cấp</SelectItem>
                  <SelectItem value="warning">Cần chú ý</SelectItem>
                  <SelectItem value="info">Theo dõi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </FilterBar>
        </CardContent>
      </Card>

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
          {!session?.user?.jiraUsername && !data.myWork?.username && (
            <Card className="border-amber-500/30 bg-amber-500/5 shadow-none">
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  <UserRoundX className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Chưa cấu hình tài khoản Jira
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Bạn cần liên kết Jira username trong trang Cài đặt để theo dõi chính xác task của mình.
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline" className="cursor-pointer shrink-0">
                  <Link href="/settings">Đến Cài đặt</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Standardization Overview Card */}
          <Card className="border-primary/20 bg-primary/[0.035] shadow-none">
            <CardContent className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={incompleteCount > 0 ? "warning" : "success"}>
                    {incompleteCount > 0 ? "Cần chuẩn hóa" : "Đã đạt chuẩn"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Chính sách luồng v{allStdTasks[0]?.policyVersion ?? "1.0"}
                  </span>
                  {data?.myWork?.lastSyncedAt && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      · Đồng bộ Jira lúc{" "}
                      {new Date(data.myWork.lastSyncedAt).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {incompleteCount > 0
                    ? `${incompleteCount}/${totalActive} task cần bổ sung dữ liệu`
                    : `${totalActive}/${totalActive} task đã đạt đủ tiêu chuẩn`}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
                  {incompleteCount > 0
                    ? "Một số task còn thiếu Estimate/Points, Worklog, Fix Version hoặc Due date theo chính sách quy trình. Bổ sung dữ liệu để hệ thống dự báo chính xác hơn."
                    : "Toàn bộ task bạn đang phụ trách đã có đủ Story point / Estimate, Worklog, Fix Version và Due date."}
                </p>

                {totalActive > 0 && (
                  <div className="pt-2 max-w-md">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">Tiến độ chuẩn hóa</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {completePercent}% ({completeCount}/{totalActive})
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          completePercent === 100 ? "bg-emerald-500" : "bg-primary"
                        )}
                        style={{ width: `${completePercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 shrink-0">
                <BulkStandardizationAction
                  selectedKeys={selectedStdTasks}
                  allTasks={allStdTasks}
                  incompleteCount={incompleteCount}
                  onFilterToSingleProject={(projectKey) => {
                    setStdProjectFilter(projectKey);
                    setSelectedStdTasks(
                      new Set(
                        allStdTasks
                          .filter((t) => t.projectKey === projectKey && selectedStdTasks.has(t.jiraKey))
                          .map((t) => t.jiraKey)
                      )
                    );
                  }}
                />

                {selectedStdTasks.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedStdTasks(new Set())}
                    className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                  >
                    Bỏ chọn tất cả
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 4 Interactive Metric Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Estimation */}
            <button
              type="button"
              onClick={() =>
                setStdMissingFilter((prev) => (prev === "ESTIMATION" ? "ALL" : "ESTIMATION"))
              }
              className={cn(
                "group cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary/50",
                stdMissingFilter === "ESTIMATION" && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Estimate / Points</span>
                <span className="h-7 w-7 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold">
                  #
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {missingCounts.ESTIMATION}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {missingCounts.ESTIMATION > 0 ? "Task thiếu điểm / estimate" : "Đã đủ điểm/estimate"}
              </p>
            </button>

            {/* Worklog */}
            <button
              type="button"
              onClick={() =>
                setStdMissingFilter((prev) => (prev === "WORKLOG" ? "ALL" : "WORKLOG"))
              }
              className={cn(
                "group cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary/50",
                stdMissingFilter === "WORKLOG" && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Worklog</span>
                <span className="h-7 w-7 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center text-xs font-bold">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {missingCounts.WORKLOG}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {missingCounts.WORKLOG > 0 ? "Chưa ghi nhận thời gian" : "Đã có worklog"}
              </p>
            </button>

            {/* Fix Version */}
            <button
              type="button"
              onClick={() =>
                setStdMissingFilter((prev) => (prev === "FIX_VERSION" ? "ALL" : "FIX_VERSION"))
              }
              className={cn(
                "group cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary/50",
                stdMissingFilter === "FIX_VERSION" && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Fix Version</span>
                <span className="h-7 w-7 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-bold">
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {missingCounts.FIX_VERSION}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {missingCounts.FIX_VERSION > 0 ? "Chưa gán bản phát hành" : "Đã gán phiên bản"}
              </p>
            </button>

            {/* Due date */}
            <button
              type="button"
              onClick={() =>
                setStdMissingFilter((prev) => (prev === "DUE_DATE" ? "ALL" : "DUE_DATE"))
              }
              className={cn(
                "group cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary/50",
                stdMissingFilter === "DUE_DATE" && "border-primary bg-primary/5 ring-1 ring-primary/20"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Due date</span>
                <span className="h-7 w-7 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-bold">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {missingCounts.DUE_DATE}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {missingCounts.DUE_DATE > 0 ? "Chưa đặt hạn hoàn thành" : "Đã có hạn hoàn thành"}
              </p>
            </button>
          </div>

          {/* Filter Bar for Standardization Queue */}
          <Card className="shadow-none">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <SearchField
                    value={stdSearch}
                    onChange={setStdSearch}
                    placeholder="Tìm mã Jira, tên task…"
                    ariaLabel="Tìm trong task chuẩn hóa"
                  />

                  <Select
                    value={stdMissingFilter}
                    onValueChange={(val) => setStdMissingFilter(val as "ALL" | RequirementCode)}
                  >
                    <SelectTrigger className="cursor-pointer text-xs">
                      <SelectValue placeholder="Tiêu chuẩn cần tìm" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tất cả tiêu chuẩn</SelectItem>
                      <SelectItem value="ESTIMATION">Thiếu Estimate / Points</SelectItem>
                      <SelectItem value="WORKLOG">Chưa log Worklog</SelectItem>
                      <SelectItem value="FIX_VERSION">Thiếu Fix Version</SelectItem>
                      <SelectItem value="DUE_DATE">Thiếu Due date</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={stdProjectFilter}
                    onValueChange={(val) => setStdProjectFilter(val)}
                  >
                    <SelectTrigger className="cursor-pointer text-xs">
                      <SelectValue placeholder="Dự án" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Tất cả dự án</SelectItem>
                      {(data?.filters.projects ?? []).map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={stdStaleFilter}
                    onValueChange={(val) => setStdStaleFilter(val as "ALL" | "stale" | "healthy")}
                  >
                    <SelectTrigger className="cursor-pointer text-xs">
                      <SelectValue placeholder="Tình trạng SLA" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Mọi trạng thái SLA</SelectItem>
                      <SelectItem value="stale">Đang ngâm (Vượt SLA)</SelectItem>
                      <SelectItem value="healthy">Trong hạn SLA</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={stdSort}
                    onValueChange={(val) =>
                      setStdSort(val as "missing-desc" | "stateAge-desc" | "updated-desc" | "key-asc")
                    }
                  >
                    <SelectTrigger className="cursor-pointer text-xs">
                      <SelectValue placeholder="Sắp xếp" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="missing-desc">Thiếu nhiều mục nhất</SelectItem>
                      <SelectItem value="stateAge-desc">Ngâm lâu nhất</SelectItem>
                      <SelectItem value="updated-desc">Mới cập nhật nhất</SelectItem>
                      <SelectItem value="key-asc">Mã Jira (A-Z)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {hasStdFilters && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearStdFilters}
                      className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" aria-hidden /> Xóa bộ lọc chuẩn hóa
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Standardization Task List Card */}
          <Card className="shadow-none">
            <CardHeader className="gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="h-4 w-4 text-primary" aria-hidden /> Hàng đợi chuẩn hóa
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Hiển thị {filteredStdTasks.length} task chưa hoàn thiện tiêu chuẩn dữ liệu luồng công việc.
                </CardDescription>
              </div>

              {filteredStdTasks.length > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    Đã chọn {selectedStdTasks.size} task
                  </span>
                  {selectedStdTasks.size > 0 && (
                    <BulkStandardizationAction
                      selectedKeys={selectedStdTasks}
                      allTasks={allStdTasks}
                      incompleteCount={incompleteCount}
                      onFilterToSingleProject={(projectKey) => {
                        setStdProjectFilter(projectKey);
                        setSelectedStdTasks(
                          new Set(
                            allStdTasks
                              .filter((t) => t.projectKey === projectKey && selectedStdTasks.has(t.jiraKey))
                              .map((t) => t.jiraKey)
                          )
                        );
                      }}
                    />
                  )}
                </div>
              )}
            </CardHeader>

            <CardContent className="p-0">
              {filteredStdTasks.length === 0 ? (
                incompleteCount === 0 && totalActive > 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-6 w-6" aria-hidden />
                    </span>
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        Tuyệt vời! Toàn bộ task của bạn đã đạt chuẩn dữ liệu
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                        Không có task nào bị thiếu Estimate, Worklog, Fix Version hoặc Due date.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTabChange("stale")}
                      className="cursor-pointer mt-2"
                    >
                      Xem phân tích tồn đọng (SLA)
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" aria-hidden />
                    </Button>
                  </div>
                ) : (
                  <StaleEmptyState
                    filtered={hasStdFilters}
                    onClear={clearStdFilters}
                    title={hasStdFilters ? "Không có task nào khớp với bộ lọc" : "Không có task đang hoạt động"}
                    hint={
                      hasStdFilters
                        ? "Thử thay đổi bộ lọc hoặc xóa lọc để xem lại danh sách."
                        : "Bạn hiện không có task nào đang chờ thực hiện trong các dự án được chọn."
                    }
                  />
                )
              ) : (
                <>
                  {/* Mobile View: Cards */}
                  <div className="divide-y lg:hidden">
                    {filteredStdTasks.map((task) => {
                      const isSelected = selectedStdTasks.has(task.jiraKey);
                      const missingFields = buildMissingBulkFields(new Set([task.jiraKey]), allStdTasks);

                      return (
                        <div
                          key={task.jiraKey}
                          className={cn(
                            "p-4 transition-colors duration-150 hover:bg-muted/40",
                            isSelected && "bg-primary/[0.04]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelectStd(task.jiraKey)}
                                aria-label={`Chọn task ${task.jiraKey}`}
                                className="cursor-pointer"
                              />
                              <Link
                                href={`/issue/${task.jiraKey}`}
                                className="font-mono text-xs font-semibold text-primary hover:underline"
                              >
                                {task.jiraKey}
                              </Link>
                              <Badge variant="secondary" className="text-[11px]">
                                {task.status}
                              </Badge>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {task.policyId === "planned-work"
                                ? "Planned"
                                : task.policyId === "maintenance-work"
                                ? "Maintenance"
                                : "Default"}
                            </Badge>
                          </div>

                          <p className="mt-2 text-sm font-medium text-foreground line-clamp-2">
                            {task.summary || "Task chưa đặt tên"}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {task.missing.map((req) => (
                              <Badge
                                key={req}
                                variant="danger"
                                className="text-[10px] flex items-center gap-1 font-normal"
                              >
                                <X className="h-3 w-3" aria-hidden />
                                {req === "ESTIMATION"
                                  ? getEstimationMissingLabel(task, allStdTasks)
                                  : `Thiếu ${REQUIREMENT_LABELS[req]}`}
                              </Badge>
                            ))}
                          </div>

                          {/* Secondary operational signals */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                            {task.isStale && (
                              <Badge variant="warning" className="text-[10px]">
                                Ngâm {task.stateAgeDays}/{task.slaDays} ngày
                              </Badge>
                            )}
                            {task.overdueDays > 0 && (
                              <Badge variant="danger" className="text-[10px]">
                                Quá hạn {task.overdueDays} ngày
                              </Badge>
                            )}
                            {task.isBlocked && (
                              <Badge variant="danger" className="text-[10px]">
                                Bị chặn
                              </Badge>
                            )}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
                            <Button asChild variant="outline" size="sm" className="cursor-pointer text-xs h-7">
                              <Link href={`/issue/${task.jiraKey}`}>Mở task</Link>
                            </Button>
                            <div className="flex items-center gap-1.5">
                              {task.missing.includes("WORKLOG") && (
                                <Button
                                  asChild
                                  size="sm"
                                  variant={task.missing.length === 1 ? "default" : "outline"}
                                  className="cursor-pointer text-xs h-7"
                                >
                                  <Link
                                    href={`/issue/${task.jiraKey}?action=log-work&returnTo=${encodeURIComponent(
                                      "/stale?view=my-work&tab=standardization"
                                    )}`}
                                  >
                                    <Clock className="h-3 w-3 mr-1" aria-hidden />
                                    Ghi Worklog
                                  </Link>
                                </Button>
                              )}
                              {task.missing.some((m) => m !== "WORKLOG") && (
                                <Button asChild size="sm" className="cursor-pointer text-xs h-7">
                                  <Link
                                    href={`/bulk?project=${encodeURIComponent(task.projectKey)}&keys=${task.jiraKey}&fields=${missingFields}&returnTo=standardization`}
                                  >
                                    <ListChecks className="h-3.5 w-3.5 mr-1" aria-hidden />
                                    {task.missing.includes("WORKLOG") ? "Sửa trường" : "Chuẩn hóa"}
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop View: Table */}
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-xs text-muted-foreground border-b">
                          <th className="w-10 px-4 py-3 text-center">
                            <Checkbox
                              checked={
                                filteredStdTasks.length > 0 &&
                                filteredStdTasks.every((t) => selectedStdTasks.has(t.jiraKey))
                              }
                              onCheckedChange={(checked) => handleSelectAllStd(Boolean(checked))}
                              aria-label="Chọn tất cả task trên trang"
                              className="cursor-pointer"
                            />
                          </th>
                          <th className="px-4 py-3 font-medium">Task</th>
                          <th className="px-3 py-3 font-medium">Chính sách &amp; Trạng thái</th>
                          <th className="px-3 py-3 font-medium">Kiểm tra tiêu chuẩn</th>
                          <th className="px-3 py-3 font-medium">Tín hiệu vận hành</th>
                          <th className="px-4 py-3 text-right font-medium">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredStdTasks.map((task) => {
                          const isSelected = selectedStdTasks.has(task.jiraKey);
                          const missingFields = buildMissingBulkFields(
                            new Set([task.jiraKey]),
                            allStdTasks
                          );

                          return (
                            <tr
                              key={task.jiraKey}
                              className={cn(
                                "transition-colors duration-150 hover:bg-muted/40 group",
                                isSelected && "bg-primary/[0.035]"
                              )}
                            >
                              {/* Checkbox */}
                              <td className="w-10 px-4 py-3.5 text-center align-top">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleSelectStd(task.jiraKey)}
                                  aria-label={`Chọn task ${task.jiraKey}`}
                                  className="cursor-pointer"
                                />
                              </td>

                              {/* Task details */}
                              <td className="max-w-sm px-4 py-3.5 align-top">
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/issue/${task.jiraKey}`}
                                    className="cursor-pointer font-mono text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {task.jiraKey}
                                  </Link>
                                  <span className="text-[11px] text-muted-foreground">
                                    {task.projectKey} · {task.type}
                                  </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                                  {task.summary || "Task chưa đặt tên"}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {formatMissingSummary(task.missing)}
                                </p>
                              </td>

                              {/* Policy and Status */}
                              <td className="px-3 py-3.5 align-top">
                                <div className="space-y-1.5">
                                  <Badge variant="outline" className="text-[11px] font-normal">
                                    {task.policyId === "planned-work"
                                      ? "Planned"
                                      : task.policyId === "maintenance-work"
                                      ? "Maintenance"
                                      : "Default"}
                                  </Badge>
                                  <div>
                                    <Badge variant="secondary" className="text-[11px]">
                                      {task.status}
                                    </Badge>
                                  </div>
                                </div>
                              </td>

                              {/* Checklist Badges */}
                              <td className="px-3 py-3.5 align-top">
                                <div className="grid grid-cols-2 gap-1.5 text-xs max-w-xs">
                                  {/* Estimate */}
                                  {task.required.includes("ESTIMATION") && (
                                    <div>
                                      {task.missing.includes("ESTIMATION") ? (
                                        <Badge
                                          variant="danger"
                                          className="text-[10px] w-full justify-start font-normal"
                                        >
                                          <X className="h-3 w-3 mr-1 shrink-0" aria-hidden />{" "}
                                          {getEstimationMissingLabel(task, allStdTasks)}
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="success"
                                          className="text-[10px] w-full justify-start font-normal"
                                        >
                                          <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                                          {task.points
                                            ? `${task.points}pt`
                                            : task.originalEstimateSeconds
                                            ? "Có Est"
                                            : "Đã có"}
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                  {/* Worklog */}
                                  {task.required.includes("WORKLOG") && (
                                    <div>
                                      {task.missing.includes("WORKLOG") ? (
                                        <Link
                                          href={`/issue/${task.jiraKey}?action=log-work&returnTo=${encodeURIComponent(
                                            "/stale?view=my-work&tab=standardization"
                                          )}`}
                                          title={`Ghi Worklog cho ${task.jiraKey}`}
                                          className="block group/wl"
                                        >
                                          <Badge
                                            variant="danger"
                                            className="text-[10px] w-full justify-start font-normal cursor-pointer group-hover/wl:bg-destructive/20 transition-colors"
                                          >
                                            <Clock className="h-3 w-3 mr-1 shrink-0" aria-hidden /> Chưa log work
                                          </Badge>
                                        </Link>
                                      ) : (
                                        <Badge
                                          variant="success"
                                          className="text-[10px] w-full justify-start font-normal"
                                        >
                                          <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                                          {formatTimeSpent(task.timeSpent) ?? "Đã log"}
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                  {/* Fix Version */}
                                  {task.required.includes("FIX_VERSION") && (
                                    <div>
                                      {task.missing.includes("FIX_VERSION") ? (
                                        <Badge
                                          variant="danger"
                                          className="text-[10px] w-full justify-start font-normal"
                                        >
                                          <X className="h-3 w-3 mr-1 shrink-0" aria-hidden /> Thiếu FixVer
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="success"
                                          className="text-[10px] w-full justify-start font-normal truncate max-w-32"
                                        >
                                          <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                                          {task.fixVersionNames[0] ?? "Có FV"}
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                  {/* Due Date */}
                                  {task.required.includes("DUE_DATE") && (
                                    <div>
                                      {task.missing.includes("DUE_DATE") ? (
                                        <Badge
                                          variant="danger"
                                          className="text-[10px] w-full justify-start font-normal"
                                        >
                                          <X className="h-3 w-3 mr-1 shrink-0" aria-hidden /> Thiếu Due date
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="success"
                                          className="text-[10px] w-full justify-start font-normal"
                                        >
                                          <Check className="h-3 w-3 mr-1 shrink-0" aria-hidden />
                                          {formatDueDate(task.dueDate)}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Operational Signals */}
                              <td className="px-3 py-3.5 align-top">
                                <div className="space-y-1 text-xs">
                                  {task.isStale ? (
                                    <Badge variant="warning" className="text-[11px] font-normal">
                                      Ngâm {task.stateAgeDays}/{task.slaDays} ngày
                                    </Badge>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground block">
                                      Trong hạn SLA ({task.stateAgeDays}/{task.slaDays}d)
                                    </span>
                                  )}
                                  {task.overdueDays > 0 && (
                                    <div>
                                      <Badge variant="danger" className="text-[11px] font-normal">
                                        Quá hạn {task.overdueDays} ngày
                                      </Badge>
                                    </div>
                                  )}
                                  {task.isBlocked && (
                                    <div>
                                      <Badge variant="danger" className="text-[11px] font-normal">
                                        Bị chặn
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3.5 text-right align-top">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="cursor-pointer text-xs h-8 text-muted-foreground hover:text-foreground"
                                  >
                                    <Link href={`/issue/${task.jiraKey}`}>Mở task</Link>
                                  </Button>
                                  {task.missing.includes("WORKLOG") && (
                                    <Button
                                      asChild
                                      size="sm"
                                      variant={task.missing.length === 1 ? "default" : "outline"}
                                      className="cursor-pointer text-xs h-8"
                                    >
                                      <Link
                                        href={`/issue/${task.jiraKey}?action=log-work&returnTo=${encodeURIComponent(
                                          "/stale?view=my-work&tab=standardization"
                                        )}`}
                                      >
                                        <Clock className="h-3.5 w-3.5 mr-1" aria-hidden />
                                        Ghi Worklog
                                      </Link>
                                    </Button>
                                  )}
                                  {task.missing.some((m) => m !== "WORKLOG") && (
                                    <Button
                                      asChild
                                      size="sm"
                                      className="cursor-pointer text-xs h-8 bg-primary/90 hover:bg-primary text-primary-foreground font-medium"
                                    >
                                      <Link
                                        href={`/bulk?project=${encodeURIComponent(task.projectKey)}&keys=${task.jiraKey}&fields=${missingFields}&returnTo=standardization`}
                                      >
                                        <ListChecks className="h-3.5 w-3.5 mr-1" aria-hidden />
                                        {task.missing.includes("WORKLOG") ? "Sửa trường" : "Chuẩn hóa"}
                                      </Link>
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW: MY WORK -> TAB: STALE OR VIEW: TEAM */}
      {data && summary && (viewMode === "team" || activeTab === "stale") && (
        <>
          <InsightBrief data={data} staleRate={staleRate} />

          {data.tasks.length > 0 && (
            <>
              <section aria-labelledby="focus-heading">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 id="focus-heading" className="text-base font-semibold">
                      Lăng kính ưu tiên
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Chọn một nhóm để thu hẹp hàng đợi hành động và danh sách chi tiết.
                    </p>
                  </div>
                  {focus !== "all" && (
                    <Button
                      className="cursor-pointer"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFocus("all")}
                    >
                      <X aria-hidden /> Bỏ lăng kính
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FocusCard
                    active={focus === "high"}
                    count={focusCounts.high}
                    description="Mức độ cao, cần xác nhận chủ sở hữu và bước tiếp theo ngay."
                    icon={ShieldAlert}
                    label="Khẩn cấp"
                    onClick={() => selectFocus("high")}
                    tone="danger"
                  />
                  <FocusCard
                    active={focus === "blocked"}
                    count={focusCounts.blocked}
                    description="Không thể tiến triển nếu phụ thuộc hoặc quyết định chưa được tháo gỡ."
                    icon={Lock}
                    label="Đang bị chặn"
                    onClick={() => selectFocus("blocked")}
                    tone="danger"
                  />
                  <FocusCard
                    active={focus === "overdue"}
                    count={focusCounts.overdue}
                    description="Đã vượt hạn bàn giao, cần thương lượng lại phạm vi hoặc thời hạn."
                    icon={CalendarX}
                    label="Đã quá hạn"
                    onClick={() => selectFocus("overdue")}
                    tone="warning"
                  />
                  <FocusCard
                    active={focus === "unassigned"}
                    count={focusCounts.unassigned}
                    description="Chưa có người chịu trách nhiệm nên nguy cơ tiếp tục già hóa cao."
                    icon={UserRoundX}
                    label="Chưa phân công"
                    onClick={() => selectFocus("unassigned")}
                    tone="warning"
                  />
                </div>
              </section>

              <ActionQueue tasks={priorityTasks} focus={focus} />

              <section aria-labelledby="diagnostic-heading">
                <div className="mb-3">
                  <h2 id="diagnostic-heading" className="text-base font-semibold">
                    Chẩn đoán nguyên nhân
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Dùng các tín hiệu bên dưới để điều chỉnh quy trình, không để đánh giá hiệu suất cá nhân.
                  </p>
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  <Card className="shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CircleGauge className="h-4 w-4 text-primary" aria-hidden /> Điểm nghẽn quy trình
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Bấm một trạng thái để lọc toàn bộ phân tích.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {data.bottleneck.slice(0, 6).map((item) => {
                        const max = data.bottleneck[0]?.count || 1;
                        return (
                          <button
                            key={item.status}
                            type="button"
                            onClick={() => setStatus(item.status)}
                            className="w-full cursor-pointer rounded-md p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                              <span className="flex min-w-0 items-center gap-2 font-medium">
                                <span
                                  className={cn(
                                    "h-2 w-2 shrink-0 rounded-full",
                                    GROUP_DOT[item.group] ?? "bg-muted-foreground/50"
                                  )}
                                  aria-hidden
                                />
                                <span className="truncate">{item.status}</span>
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {item.count} task · TB {item.avgStateAge} ngày
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/75"
                                style={{ width: `${(item.count / max) * 100}%` }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarClock className="h-4 w-4 text-primary" aria-hidden /> Tuổi của phần việc tồn đọng
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Phân tầng theo số ngày đã vượt SLA để tránh nợ quy trình kéo dài.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <AgingDistribution tasks={data.tasks} />
                    </CardContent>
                  </Card>

                  <Card className="shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4 text-primary" aria-hidden /> Nơi cần hỗ trợ
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Điều phối theo loại trở ngại và khối lượng, không xếp hạng cá nhân.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {data.support.slice(0, 6).map((entry) => (
                        <button
                          key={entry.assignee}
                          type="button"
                          onClick={() =>
                            entry.assignee === "(unassigned)"
                              ? selectFocus("unassigned")
                              : setAssignee(entry.assignee)
                          }
                          className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-md p-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {entry.assignee === "(unassigned)" ? "Chưa phân công" : entry.assignee}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {entry.reasons[0]?.label ?? "Cần xem xét"} · TB {entry.avgStateAge} ngày
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">
                              {entry.taskCount}
                            </span>
                            <ChevronRight
                              className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none"
                              aria-hidden
                            />
                          </div>
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </section>

              {/* Detailed Stale Task List */}
              <Card className="shadow-none">
                <CardHeader className="gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between lg:space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ListTodo className="h-4 w-4 text-primary" aria-hidden /> Danh sách xử lý chi tiết
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      {focusedTasks.length} trong {data.tasks.length} task vượt SLA · mọi thời gian tính theo ngày làm việc.
                    </CardDescription>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                    <SearchField
                      value={query}
                      onChange={(v) => {
                        setQuery(v);
                        setVisibleCount(50);
                      }}
                      placeholder="Tìm key, nội dung, người xử lý…"
                      ariaLabel="Tìm trong task tồn đọng"
                      className="min-w-0 sm:w-72"
                    />
                    <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                      <SelectTrigger className="cursor-pointer sm:w-52" aria-label="Sắp xếp task tồn đọng">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Ưu tiên can thiệp</SelectItem>
                        <SelectItem value="overBy">Vượt SLA nhiều nhất</SelectItem>
                        <SelectItem value="stateAge">Ở trạng thái lâu nhất</SelectItem>
                        <SelectItem value="overdue">Quá hạn nhiều nhất</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {visibleTasks.length === 0 ? (
                    <StaleEmptyState filtered onClear={clearFilters} />
                  ) : (
                    <>
                      <div className="divide-y lg:hidden">
                        {visibleTasks.map((task) => (
                          <Link
                            key={task.jiraKey}
                            href={`/issue/${task.jiraKey}`}
                            className="block cursor-pointer px-5 py-4 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <span className="font-mono text-xs font-semibold text-primary">{task.jiraKey}</span>
                                <p className="mt-1 line-clamp-2 text-sm font-medium">{task.summary || "Task chưa đặt tên"}</p>
                              </div>
                              <SeverityBadge severity={task.severity} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <Badge variant="secondary">{task.status}</Badge>
                              <Badge variant="outline">{task.staleReasonLabel}</Badge>
                              {task.overdueDays > 0 && <Badge variant="danger">Quá hạn {task.overdueDays} ngày</Badge>}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{task.assigneeJira ?? "Chưa phân công"}</span>
                              <span className="tabular-nums">
                                {task.stateAgeDays}/{task.slaDays} ngày · +{task.overByDays} ngày
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>

                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-muted/40 text-xs text-muted-foreground">
                              <th className="px-5 py-3 font-medium">Task</th>
                              <th className="px-3 py-3 font-medium">Chủ sở hữu &amp; trạng thái</th>
                              <th className="px-3 py-3 font-medium">Can thiệp đề xuất</th>
                              <th className="px-3 py-3 text-right font-medium">Tuổi / SLA</th>
                              <th className="px-3 py-3 font-medium">Rủi ro bàn giao</th>
                              <th className="px-5 py-3 text-right font-medium">Mức độ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {visibleTasks.map((task) => (
                              <tr
                                key={task.jiraKey}
                                onClick={() => router.push(`/issue/${task.jiraKey}`)}
                                className="cursor-pointer transition-colors duration-150 hover:bg-muted/40 group"
                              >
                                <td className="max-w-sm px-5 py-3.5 align-top">
                                  <Link
                                    href={`/issue/${task.jiraKey}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="cursor-pointer font-mono text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    {task.jiraKey}
                                  </Link>
                                  <p className="mt-1 line-clamp-2 font-medium group-hover:text-primary transition-colors">
                                    {task.summary || "Task chưa đặt tên"}
                                  </p>
                                  <TaskMeta task={task} />
                                </td>
                                <td className="px-3 py-3.5 align-top">
                                  <p
                                    className={cn(
                                      "text-xs font-medium",
                                      !task.assigneeJira && "text-amber-700 dark:text-amber-400"
                                    )}
                                  >
                                    {task.assigneeJira ?? "Chưa phân công"}
                                  </p>
                                  <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        GROUP_DOT[task.statusGroup] ?? "bg-muted-foreground/50"
                                      )}
                                      aria-hidden
                                    />
                                    {task.status}
                                  </span>
                                </td>
                                <td className="px-3 py-3.5 align-top">
                                  <p className="text-xs font-semibold">
                                    {ACTION_BY_REASON[task.staleReason] ?? "Kiểm tra bước tiếp theo"}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">{task.staleReasonLabel}</p>
                                </td>
                                <td className="px-3 py-3.5 text-right align-top tabular-nums">
                                  <p className="text-xs font-semibold">
                                    {task.stateAgeDays} / {task.slaDays} ngày
                                  </p>
                                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                                    +{task.overByDays} ngày vượt
                                  </p>
                                </td>
                                <td className="px-3 py-3.5 align-top">
                                  {task.overdueDays > 0 ? (
                                    <Badge variant="danger">Quá hạn {task.overdueDays} ngày</Badge>
                                  ) : task.dueDate ? (
                                    <span className="text-xs text-muted-foreground">
                                      Hạn {formatDueDate(task.dueDate)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Chưa có hạn chót</span>
                                  )}
                                  {task.expectedCycleMax == null ? (
                                    <p className="mt-1.5 text-xs text-muted-foreground">Chưa có baseline theo điểm</p>
                                  ) : (
                                    task.baselineLevel !== "within" && (
                                      <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                                        Vượt baseline {task.points} điểm
                                      </p>
                                    )
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-right align-top">
                                  <SeverityBadge severity={task.severity} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {visibleCount < sortedTasks.length && (
                    <div className="flex flex-col items-center gap-2 border-t px-6 py-4">
                      <p className="text-xs text-muted-foreground">
                        Đang hiển thị {visibleCount} trên {sortedTasks.length} task
                      </p>
                      <Button
                        className="cursor-pointer"
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount((count) => count + 50)}
                      >
                        Xem thêm 50 task
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Clock3 className="h-4 w-4 text-primary" aria-hidden /> Áp lực WIP
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Toàn bộ việc đang làm/review trong phạm vi, không chỉ task vượt SLA.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {data.wip.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-5 text-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
                        </span>
                        <p className="text-xs text-muted-foreground">Không có WIP trong phạm vi hiện tại.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {data.wip.slice(0, 7).map((entry) => (
                          <div
                            key={entry.assignee}
                            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                          >
                            <span className="min-w-0 truncate text-sm font-medium">
                              {entry.assignee === "(unassigned)" ? "Chưa phân công" : entry.assignee}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">
                                {entry.statuses.join(" · ")}
                              </span>
                              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">
                                {entry.taskCount}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-none">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden /> Kiểm tra chất lượng dữ liệu
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Các tín hiệu cần hoàn thiện để phân tích và dự báo chính xác hơn.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">Task chưa có người xử lý</p>
                        <p className="mt-1 text-xs text-muted-foreground">Không xác định được chủ sở hữu hành động.</p>
                      </div>
                      <Badge variant={summary.totalNoAssignee > 0 ? "warning" : "success"}>
                        {summary.totalNoAssignee}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">Thiếu baseline theo story point</p>
                        <p className="mt-1 text-xs text-muted-foreground">Chưa đủ cơ sở so sánh chu kỳ theo độ lớn.</p>
                      </div>
                      <Badge variant="outline">
                        {data.tasks.filter((task) => task.expectedCycleMax == null).length}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">Task chưa có hạn chót</p>
                        <p className="mt-1 text-xs text-muted-foreground">Khó đánh giá rủi ro bàn giao theo thời gian.</p>
                      </div>
                      <Badge variant="outline">
                        {data.tasks.filter((task) => !task.dueDate).length}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
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
