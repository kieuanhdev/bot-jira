"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ListTodo } from "lucide-react";
import { ACTION_BY_REASON, GROUP_DOT, type SortMode, type Task } from "./lib/stale-types";
import { formatDueDate } from "./lib/stale-utils";
import { StaleEmptyState } from "./stale-empty-state";
import { SeverityBadge, TaskMeta } from "./stale-task-meta";

function StaleTaskMobileCard({ task }: { task: Task }) {
  return (
    <Link
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
  );
}

function StaleTaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  return (
    <tr
      onClick={onOpen}
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
  );
}

/** Detailed list of stale tasks with search, sort and "show more". */
export function StaleTaskListCard({
  visibleTasks,
  focusedCount,
  totalCount,
  sortedCount,
  visibleCount,
  query,
  sortMode,
  onQueryChange,
  onSortModeChange,
  onShowMore,
  onClearFilters,
}: {
  visibleTasks: Task[];
  focusedCount: number;
  totalCount: number;
  sortedCount: number;
  visibleCount: number;
  query: string;
  sortMode: SortMode;
  onQueryChange: (value: string) => void;
  onSortModeChange: (mode: SortMode) => void;
  onShowMore: () => void;
  onClearFilters: () => void;
}) {
  const router = useRouter();

  return (
    <Card className="shadow-none">
      <CardHeader className="gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between lg:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="h-4 w-4 text-primary" aria-hidden /> Danh sách xử lý chi tiết
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            {focusedCount} trong {totalCount} task vượt SLA · mọi thời gian tính theo ngày làm việc.
          </CardDescription>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <SearchField
            value={query}
            onChange={onQueryChange}
            placeholder="Tìm key, nội dung, người xử lý…"
            ariaLabel="Tìm trong task tồn đọng"
            className="min-w-0 sm:w-72"
          />
          <Select value={sortMode} onValueChange={(value) => onSortModeChange(value as SortMode)}>
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
          <StaleEmptyState filtered onClear={onClearFilters} />
        ) : (
          <>
            <div className="divide-y lg:hidden">
              {visibleTasks.map((task) => (
                <StaleTaskMobileCard key={task.jiraKey} task={task} />
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
                    <StaleTaskRow
                      key={task.jiraKey}
                      task={task}
                      onOpen={() => router.push(`/issue/${task.jiraKey}`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {visibleCount < sortedCount && (
          <div className="flex flex-col items-center gap-2 border-t px-6 py-4">
            <p className="text-xs text-muted-foreground">
              Đang hiển thị {visibleCount} trên {sortedCount} task
            </p>
            <Button
              className="cursor-pointer"
              variant="outline"
              size="sm"
              onClick={onShowMore}
            >
              Xem thêm 50 task
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
