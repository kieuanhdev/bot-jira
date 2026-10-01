"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MyWorkInfo } from "./lib/stale-types";

export function MyWorkHealthyState({
  myWork,
  onViewTeam,
  onViewStandardization,
}: {
  myWork?: MyWorkInfo;
  onViewTeam: () => void;
  onViewStandardization?: () => void;
}) {
  const hasIncompleteStandardization =
    (myWork?.standardization?.incomplete ?? 0) > 0 || (myWork?.standardization?.unknown ?? 0) > 0;

  return (
    <Card className="shadow-none border-emerald-500/25 bg-emerald-500/[0.035]">
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Tuyệt vời! Bạn không có task nào bị tồn đọng (vượt SLA)
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {myWork?.totalActive
                  ? `Toàn bộ ${myWork.totalActive} task bạn đang phụ trách đều có tiến độ ổn định và nằm trong thời hạn SLA cho phép.`
                  : "Bạn hiện không có task nào đang chờ xử lý trong phạm vi đã chọn."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onViewTeam}
            className="cursor-pointer shrink-0 border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            Xem toàn dự án
            <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
          </Button>
        </div>

        {hasIncompleteStandardization && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Bạn có {myWork?.standardization?.incomplete} task chưa đạt chuẩn dữ liệu
                </p>
                <p className="text-xs text-muted-foreground">
                  Task chưa bị ngâm nhưng còn thiếu Estimate, Worklog, Fix Version hoặc Due date.
                </p>
              </div>
            </div>
            {onViewStandardization && (
              <Button
                size="sm"
                onClick={onViewStandardization}
                className="cursor-pointer shrink-0 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                Kiểm tra tiêu chuẩn ({myWork?.standardization?.incomplete})
                <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden />
              </Button>
            )}
          </div>
        )}

        {myWork?.tasks && myWork.tasks.length > 0 && (
          <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
            <div className="border-b bg-muted/40 px-4 py-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Task bạn đang thực hiện ({myWork.tasks.length})
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Trong hạn SLA</span>
            </div>
            <div className="divide-y divide-border">
              {myWork.tasks.map((task) => (
                <Link
                  key={task.jiraKey}
                  href={`/issue/${task.jiraKey}`}
                  className="group flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary group-hover:underline">
                        {task.jiraKey}
                      </span>
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {task.status}
                      </Badge>
                      {task.points != null && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {task.points}pt
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-foreground font-medium group-hover:text-primary transition-colors">
                      {task.summary}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      Đang chạy tốt
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none"
                      aria-hidden="true"
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
