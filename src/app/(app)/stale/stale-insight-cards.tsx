import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock3, Users } from "lucide-react";
import type { Summary, Task, WipEntry } from "./lib/stale-types";

export function StaleWipCard({ wip }: { wip: WipEntry[] }) {
  return (
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
        {wip.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-xs text-muted-foreground">Không có WIP trong phạm vi hiện tại.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wip.slice(0, 7).map((entry) => (
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
  );
}

export function StaleDataQualityCard({ summary, tasks }: { summary: Summary; tasks: Task[] }) {
  return (
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
            {tasks.filter((task) => task.expectedCycleMax == null).length}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Task chưa có hạn chót</p>
            <p className="mt-1 text-xs text-muted-foreground">Khó đánh giá rủi ro bàn giao theo thời gian.</p>
          </div>
          <Badge variant="outline">
            {tasks.filter((task) => !task.dueDate).length}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
