"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { myWorkKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Calendar,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import type { TimelineGroup } from "@/lib/my-work/service";

export function MyTimelineTab() {
  const { data: groups, isLoading } = useQuery<TimelineGroup[]>({
    queryKey: myWorkKeys.timeline(14),
    queryFn: () => api<TimelineGroup[]>("/api/my-work/timeline?days=14"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((g) => (
          <div key={g} className="space-y-3">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Không có lịch trình công việc nào"
        hint="Bạn không có task nào đang chờ xử lý có gắn hạn chót (Due date)."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border flex items-center justify-between">
        <span>
          Lộ trình hạn chót (Due Date Timeline) trong 14 ngày tới để bạn dễ dàng sắp xếp thứ tự ưu tiên.
        </span>
        <span className="font-semibold text-foreground">
          {groups.reduce((acc, g) => acc + g.tasks.length, 0)} nhiệm vụ
        </span>
      </div>

      <div className="relative pl-4 border-l-2 border-border/80 space-y-6">
        {groups.map((group) => {
          const isOverdue = group.groupKey === "overdue";
          const isToday = group.groupKey === "today";

          return (
            <div key={group.groupKey} className="relative space-y-3">
              {/* Timeline marker node */}
              <div
                className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full border-2 border-background ${
                  isOverdue
                    ? "bg-destructive ring-4 ring-destructive/20"
                    : isToday
                    ? "bg-warning ring-4 ring-warning/20"
                    : "bg-primary"
                }`}
              />

              {/* Group Title */}
              <div className="flex items-center gap-2">
                <h3
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isOverdue
                      ? "text-destructive"
                      : isToday
                      ? "text-warning"
                      : "text-foreground"
                  }`}
                >
                  {group.title}
                </h3>
                <span className="text-2xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                  {group.tasks.length}
                </span>
              </div>

              {/* Tasks list */}
              <div className="space-y-2.5">
                {group.tasks.map((task) => (
                  <Link
                    key={task.jiraKey}
                    href={`/issue/${task.jiraKey}`}
                    className={`group block p-3.5 rounded-lg border bg-card transition-all duration-150 hover:shadow-xs cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isOverdue
                        ? "border-destructive/30 hover:border-destructive"
                        : isToday
                        ? "border-warning/30 hover:border-warning"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-primary group-hover:underline flex items-center gap-1">
                          <span>{task.jiraKey}</span>
                          <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
                        </span>

                        {task.type && (
                          <span className="text-2xs text-muted-foreground font-medium">
                            [{task.type}]
                          </span>
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

                        <Badge variant="outline" className="text-2xs">
                          {task.status}
                        </Badge>
                      </div>

                      <h4 className="text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                        {task.summary}
                      </h4>
                    </div>

                    {/* Due date info */}
                    <div className="flex items-center gap-3 shrink-0 text-2xs">
                      {task.dueDate ? (
                        <div
                          className={`flex items-center gap-1 font-semibold ${
                            isOverdue
                              ? "text-destructive"
                              : isToday
                              ? "text-warning"
                              : "text-muted-foreground"
                          }`}
                        >
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          <span>{new Date(task.dueDate).toLocaleDateString("vi-VN")}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Không có hạn</span>
                      )}

                      {task.points !== null && (
                        <span className="text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-sm">
                          {task.points} pts
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
