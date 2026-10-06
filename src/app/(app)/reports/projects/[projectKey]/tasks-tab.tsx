"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  CheckCircle2,
  FolderPlus,
  PlayCircle,
  AlertOctagon,
  Clock,
  ShieldAlert,
  UserX,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  ArrowLeft,
  X,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { getJiraIssueUrl } from "@/lib/utils";
import type {
  ProjectTasksResponse,
  ProjectMembersResponse,
  ReportPeriod,
} from "@/lib/reports/types";

interface TasksTabProps {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
  initialStatusGroup?: string | null;
  initialActivity?: string | null;
  initialAssignee?: string | null;
  onFilterChange?: (filters: { activity: string; statusGroup: string; assignee: string }) => void;
  onNavigateToOverview?: () => void;
}

const ACTIVITY_FILTERS = [
  { id: "all", label: "Tất cả hoạt động", icon: null },
  { id: "completed", label: "Hoàn thành trong kỳ", icon: CheckCircle2, color: "text-emerald-500" },
  { id: "created", label: "Tạo mới trong kỳ", icon: FolderPlus, color: "text-sky-500" },
  { id: "current_open", label: "Đang mở", icon: PlayCircle, color: "text-teal-500" },
  { id: "blocked", label: "Bị nghẽn", icon: AlertOctagon, color: "text-red-500" },
  { id: "overdue", label: "Quá hạn", icon: Clock, color: "text-amber-500" },
  { id: "over_sla", label: "Vượt SLA", icon: ShieldAlert, color: "text-rose-500" },
  { id: "unassigned", label: "Chưa phân công", icon: UserX, color: "text-purple-500" },
];

export function TasksTab({
  projectKey,
  period,
  versionId,
  initialStatusGroup,
  initialActivity,
  initialAssignee,
  onFilterChange,
  onNavigateToOverview,
}: TasksTabProps) {
  const [activity, setActivity] = useState<string>(initialActivity || "all");
  const [statusGroup, setStatusGroup] = useState<string>(initialStatusGroup || "all");
  const [assignee, setAssignee] = useState<string>(initialAssignee || "all");
  const [search, setSearch] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const limit = 20;

  const { data: meStatus } = useQuery({
    queryKey: ["me", "status"],
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    staleTime: 5 * 60 * 1000,
  });
  const jiraBaseUrl = meStatus?.jiraBaseUrl;

  // Each prop syncs its own filter and resets paging, independently of the others.
  const [prevStatusGroup, setPrevStatusGroup] = useState(initialStatusGroup);
  if (initialStatusGroup !== prevStatusGroup) {
    setPrevStatusGroup(initialStatusGroup);
    if (initialStatusGroup !== undefined) {
      setStatusGroup(initialStatusGroup || "all");
      setOffset(0);
    }
  }

  const [prevActivity, setPrevActivity] = useState(initialActivity);
  if (initialActivity !== prevActivity) {
    setPrevActivity(initialActivity);
    if (initialActivity !== undefined) {
      setActivity(initialActivity || "all");
      setOffset(0);
    }
  }

  const [prevAssignee, setPrevAssignee] = useState(initialAssignee);
  if (initialAssignee !== prevAssignee) {
    setPrevAssignee(initialAssignee);
    if (initialAssignee !== undefined) {
      setAssignee(initialAssignee || "all");
      setOffset(0);
    }
  }

  // Notify parent of filter changes for URL sync
  useEffect(() => {
    onFilterChange?.({ activity, statusGroup, assignee });
  }, [activity, statusGroup, assignee, onFilterChange]);

  // Fetch members list for assignee dropdown
  const { data: membersData } = useQuery<ProjectMembersResponse>({
    queryKey: ["reports", "members", projectKey, period.preset, period.from, period.to, versionId],
    queryFn: () => {
      const sp = new URLSearchParams({
        period: period.preset,
        from: period.from,
        to: period.to,
        timezone: period.timezone,
      });
      if (versionId && versionId !== "all") sp.set("versionId", versionId);
      return api<ProjectMembersResponse>(`/api/reports/projects/${projectKey}/members?${sp.toString()}`);
    },
    staleTime: 60_000,
  });

  const queryParams = new URLSearchParams({
    period: period.preset,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
    limit: String(limit),
    offset: String(offset),
  });

  if (versionId && versionId !== "all") queryParams.set("versionId", versionId);
  if (activity !== "all") queryParams.set("activity", activity);
  if (statusGroup !== "all") queryParams.set("statusGroup", statusGroup);
  if (assignee !== "all") queryParams.set("assignee", assignee);
  if (search.trim()) queryParams.set("search", search.trim());

  const { data, isLoading, isError } = useQuery<ProjectTasksResponse>({
    queryKey: ["reports", "tasks", projectKey, queryParams.toString()],
    queryFn: () => api<ProjectTasksResponse>(`/api/reports/projects/${projectKey}/tasks?${queryParams.toString()}`),
    staleTime: 30_000,
  });

  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit) || 1;

  const handlePageChange = (newPage: number) => {
    setOffset((newPage - 1) * limit);
  };

  const handleResetFilters = () => {
    setActivity("all");
    setStatusGroup("all");
    setAssignee("all");
    setSearch("");
    setOffset(0);
  };

  const hasActiveFilters =
    activity !== "all" ||
    statusGroup !== "all" ||
    assignee !== "all" ||
    Boolean(search.trim());

  const activeActivityLabel = ACTIVITY_FILTERS.find((f) => f.id === activity)?.label;
  const activeMemberName =
    assignee === "unassigned"
      ? "Chưa phân công"
      : membersData?.members.find((m) => m.assignee === assignee)?.displayName || assignee;

  return (
    <div className="space-y-4">
      {/* Back to overview link */}
      {onNavigateToOverview && (
        <div className="flex items-center justify-between -mb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onNavigateToOverview}
            className="h-7 -ml-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại Tổng quan</span>
          </Button>
        </div>
      )}

      {/* Context Breadcrumb / Active Filters Alert Banner */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border border-primary/20 bg-primary/5 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-primary" />
              Đang áp dụng bộ lọc:
            </span>

            {activity !== "all" && (
              <Badge variant="secondary" className="gap-1 font-normal bg-card text-foreground border border-border">
                Hoạt động: <strong className="font-semibold">{activeActivityLabel}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setActivity("all");
                    setOffset(0);
                  }}
                  className="hover:text-destructive cursor-pointer ml-0.5"
                  title="Xóa lọc hoạt động"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {statusGroup !== "all" && (
              <Badge variant="secondary" className="gap-1 font-normal bg-card text-foreground border border-border">
                Trạng thái: <strong className="font-semibold">{statusGroup}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setStatusGroup("all");
                    setOffset(0);
                  }}
                  className="hover:text-destructive cursor-pointer ml-0.5"
                  title="Xóa lọc trạng thái"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {assignee !== "all" && (
              <Badge variant="secondary" className="gap-1 font-normal bg-card text-foreground border border-border">
                Người làm: <strong className="font-semibold">{activeMemberName}</strong>
                <button
                  type="button"
                  onClick={() => {
                    setAssignee("all");
                    setOffset(0);
                  }}
                  className="hover:text-destructive cursor-pointer ml-0.5"
                  title="Xóa lọc người làm"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}

            {Boolean(search.trim()) && (
              <Badge variant="secondary" className="gap-1 font-normal bg-card text-foreground border border-border">
                Từ khóa: &quot;{search.trim()}&quot;
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setOffset(0);
                  }}
                  className="hover:text-destructive cursor-pointer ml-0.5"
                  title="Xóa tìm kiếm"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Xóa bộ lọc</span>
            </button>

            {onNavigateToOverview && (
              <Button
                variant="outline"
                size="sm"
                onClick={onNavigateToOverview}
                className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Quay lại Tổng quan</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Activity Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1">
        {ACTIVITY_FILTERS.map((f) => {
          const Icon = f.icon;
          const isSelected = activity === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setActivity(f.id);
                setOffset(0);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {Icon && <Icon className={`h-3.5 w-3.5 ${isSelected ? "text-primary-foreground" : f.color}`} />}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search and Secondary Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo mã hoặc tiêu đề task..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Status Group Dropdown */}
          <div className="w-[140px]">
            <Select
              value={statusGroup}
              onValueChange={(val) => {
                setStatusGroup(val);
                setOffset(0);
              }}
            >
              <SelectTrigger className="h-9 text-xs cursor-pointer">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhóm</SelectItem>
                <SelectItem value="Backlog">Backlog</SelectItem>
                <SelectItem value="To Do">To Do</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="In Review">In Review</SelectItem>
                <SelectItem value="QA/Test">QA/Test</SelectItem>
                <SelectItem value="Blocked">Blocked</SelectItem>
                <SelectItem value="Done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assignee Dropdown */}
          <div className="w-[160px]">
            <Select
              value={assignee}
              onValueChange={(val) => {
                setAssignee(val);
                setOffset(0);
              }}
            >
              <SelectTrigger className="h-9 text-xs cursor-pointer">
                <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Người làm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả người làm</SelectItem>
                <SelectItem value="unassigned">Chưa phân công</SelectItem>
                {membersData?.members
                  .filter((m) => m.assignee !== "unassigned")
                  .map((m) => (
                    <SelectItem key={m.assignee} value={m.assignee}>
                      {m.displayName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
            Tổng số: <strong className="text-foreground">{total}</strong> task
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm text-destructive border rounded-xl bg-destructive/10">
          Không thể tải danh sách công việc. Vui lòng thử lại.
        </div>
      ) : data?.tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground mb-2" />
          <h4 className="text-sm font-semibold">Không tìm thấy task phù hợp</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Thử thay đổi bộ lọc hoạt động, nhóm trạng thái hoặc tìm kiếm từ khóa khác.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-3">Mã task</th>
                <th className="py-2.5 px-3">Tiêu đề</th>
                <th className="py-2.5 px-3">Hoạt động trong kỳ</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3">Người làm</th>
                <th className="py-2.5 px-3 text-center">Story Point</th>
                <th className="py-2.5 px-3">Rủi ro / Cảnh báo</th>
                <th className="py-2.5 px-3">Hạn chót</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.tasks.map((task) => {
                return (
                  <tr key={task.jiraKey} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/issue/${task.jiraKey}`}
                          className="text-primary hover:underline cursor-pointer"
                          title="Xem chi tiết trong hệ thống"
                        >
                          {task.jiraKey}
                        </Link>
                        {jiraBaseUrl && (
                          <a
                            href={getJiraIssueUrl(jiraBaseUrl, task.jiraKey) || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground opacity-60 hover:opacity-100 transition-opacity"
                            title="Mở trên Jira"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 font-medium text-foreground max-w-xs truncate" title={task.summary}>
                      {task.summary}
                    </td>

                    <td className="py-2.5 px-3">
                      {task.activity === "completed" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Hoàn thành trong kỳ
                        </span>
                      ) : task.activity === "created" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <FolderPlus className="h-3 w-3" /> Tạo mới trong kỳ
                        </span>
                      ) : task.activity === "current_open" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400">
                          <PlayCircle className="h-3 w-3" /> Đang mở
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                          Không đổi
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-muted font-medium">
                        {task.status}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">
                      {task.assigneeDisplayName || "Chưa phân công"}
                    </td>

                    <td className="py-2.5 px-3 text-center font-medium">
                      {task.points !== null ? task.points : "-"}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {task.risks.length === 0 ? (
                          <span className="text-muted-foreground text-[11px]">Bình thường</span>
                        ) : (
                          task.risks.map((r) => (
                            <Badge
                              key={r}
                              variant={r === "blocked" ? "danger" : "warning"}
                              className="text-[10px] px-1.5 py-0"
                            >
                              {r === "blocked"
                                ? "Tắc nghẽn"
                                : r === "overdue"
                                ? "Quá hạn"
                                : r === "over_sla"
                                ? "Vượt SLA"
                                : "Chưa nhận"}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                      {task.dueDate || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>
            Trang <strong>{currentPage}</strong> / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs cursor-pointer"
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs cursor-pointer"
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Sau
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
