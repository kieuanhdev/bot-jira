"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { myWorkKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  CheckSquare,
  Search,
  Calendar,
  Clock,
  Eye,
  UserCheck,
  FileCheck2,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ComponentType } from "react";
import type { MyWorkTaskItem, TaskRoleFilter } from "@/lib/my-work/service";

interface MyTasksTabProps {
  initialRole?: TaskRoleFilter;
  onRoleChange?: (role: TaskRoleFilter) => void;
}

export function MyTasksTab({ initialRole = "assigned", onRoleChange }: MyTasksTabProps) {
  const [role, setRole] = useState<TaskRoleFilter>(initialRole);
  const [status, setStatus] = useState<string>("ACTIVE");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const handleRoleSelect = (newRole: TaskRoleFilter) => {
    setRole(newRole);
    setPage(1);
    onRoleChange?.(newRole);
  };

  const { data, isLoading } = useQuery<{
    items: MyWorkTaskItem[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: myWorkKeys.tasks(role, status, search, page),
    queryFn: () => {
      const sp = new URLSearchParams({
        role,
        status,
        page: String(page),
        limit: "15",
      });
      if (search.trim()) sp.set("search", search.trim());
      return api(`/api/my-work/tasks?${sp.toString()}`);
    },
  });

  const roleTabs: Array<{ id: TaskRoleFilter; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "assigned", label: "Được giao cho tôi", icon: CheckSquare },
    { id: "awaiting_review", label: "Chờ tôi Review", icon: UserCheck },
    { id: "awaiting_test", label: "Chờ tôi Test", icon: FileCheck2 },
    { id: "reported", label: "Tôi báo cáo", icon: AlertCircle },
    { id: "watching", label: "Đang theo dõi", icon: Eye },
  ];

  return (
    <div className="space-y-4">
      {/* Role filter buttons */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {roleTabs.map((t) => {
          const Icon = t.icon;
          const isActive = role === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleRoleSelect(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border border-border">
        {/* Status quick tabs */}
        <div className="flex items-center gap-1.5 bg-muted p-1 rounded-md text-xs">
          {[
            { id: "ACTIVE", label: "Đang xử lý" },
            { id: "ALL", label: "Tất cả" },
            { id: "DONE", label: "Đã hoàn thành" },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStatus(s.id);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-sm font-medium transition-colors cursor-pointer ${
                status === s.id
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search box */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            placeholder="Tìm theo mã task hoặc tiêu đề..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 rounded-lg border border-border bg-card flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-5 w-3/4" />
              <div className="flex items-center gap-2 pt-1">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Không có công việc nào phù hợp"
          hint="Bạn đã hoàn thành hết các nhiệm vụ trong danh mục này hoặc không có dữ liệu tìm kiếm."
        />
      ) : (
        <div className="space-y-2.5">
          {data.items.map((task) => {
            const isDone = task.statusCategory?.toLowerCase() === "done";
            return (
              <Link
                key={task.jiraKey}
                href={`/issue/${task.jiraKey}`}
                className={`group block p-3.5 sm:p-4 rounded-lg border transition-all duration-150 hover:shadow-xs bg-card cursor-pointer ${
                  task.isOverdue
                    ? "border-destructive/30 bg-destructive/5 hover:border-destructive/60"
                    : task.isDueToday
                    ? "border-warning/30 bg-warning/5 hover:border-warning/60"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Left: Key & Project & Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-primary group-hover:underline flex items-center gap-1">
                      <span>{task.jiraKey}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
                    </span>

                    {task.type && (
                      <Badge variant="outline" className="text-2xs font-normal">
                        {task.type}
                      </Badge>
                    )}

                    {task.priority && (
                      <Badge
                        variant={
                          /highest|critical|high/i.test(task.priority)
                            ? "danger"
                            : /medium/i.test(task.priority)
                            ? "warning"
                            : "neutral"
                        }
                        className="text-2xs"
                      >
                        {task.priority}
                      </Badge>
                    )}

                    {task.isWatching && (
                      <Badge variant="secondary" className="text-2xs flex items-center gap-1">
                        <Eye className="w-2.5 h-2.5" aria-hidden="true" />
                        Watching
                      </Badge>
                    )}
                  </div>

                  {/* Right: Status badge */}
                  <div>
                    <Badge
                      variant={
                        isDone
                          ? "success"
                          : /progress|doing/i.test(task.status)
                          ? "primary-soft"
                          : /review|test/i.test(task.status)
                          ? "info"
                          : "neutral"
                      }
                      className="text-xs font-medium"
                    >
                      {task.status}
                    </Badge>
                  </div>
                </div>

                {/* Summary */}
                <h4 className="font-medium text-sm text-foreground mt-1.5 leading-snug group-hover:text-primary transition-colors">
                  {task.summary}
                </h4>

                {/* Footer metadata */}
                <div className="flex items-center justify-between gap-2 flex-wrap mt-2.5 pt-2 border-t border-border/60 text-2xs text-muted-foreground">
                  <div className="flex items-center gap-3 flex-wrap">
                    {task.dueDate && (
                      <div
                        className={`flex items-center gap-1 font-medium ${
                          task.isOverdue
                            ? "text-destructive"
                            : task.isDueToday
                            ? "text-warning"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Calendar className="w-3 h-3" aria-hidden="true" />
                        <span>
                          {task.isOverdue ? "Quá hạn: " : task.isDueToday ? "Hạn hôm nay: " : "Hạn: "}
                          {new Date(task.dueDate).toLocaleDateString("vi-VN")}
                        </span>
                      </div>
                    )}

                    {task.points !== null && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-foreground">{task.points}</span>
                        <span>points</span>
                      </div>
                    )}

                    {task.timeSpent ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        <span>{Math.round((task.timeSpent / 3600) * 10) / 10}h đã log</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Assignee / Reporter info */}
                  <div className="text-right">
                    {role !== "assigned" && task.assigneeJira ? (
                      <span>Người làm: <strong className="text-foreground">{task.assigneeJira}</strong></span>
                    ) : role === "awaiting_review" && task.approverJira ? (
                      <span>Approver: <strong className="text-foreground">{task.approverJira}</strong></span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
              <span>
                Hiển thị trang <strong>{data.pagination.page}</strong> / <strong>{data.pagination.totalPages}</strong> ({data.pagination.total} task)
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={data.pagination.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  disabled={data.pagination.page >= data.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-md border border-border disabled:opacity-40 hover:bg-muted cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
