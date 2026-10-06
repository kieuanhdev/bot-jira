import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RequirementCode } from "@/lib/issues/standardization";
import { cn } from "@/lib/utils";
import { CalendarClock, Clock3, Layers, UserRoundX } from "lucide-react";
import type { StandardizationTask } from "./lib/stale-types";
import type { StdMissingFilter } from "./lib/stale-utils";
import { BulkStandardizationAction } from "./stale-standardization-action";

/** Shown when the user has no Jira username configured. */
export function JiraUsernameWarning() {
  return (
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
  );
}

export function StandardizationOverviewCard({
  allStdTasks,
  selectedStdTasks,
  incompleteCount,
  completeCount,
  totalActive,
  completePercent,
  lastSyncedAt,
  onFilterToSingleProject,
  onClearSelection,
}: {
  allStdTasks: StandardizationTask[];
  selectedStdTasks: Set<string>;
  incompleteCount: number;
  completeCount: number;
  totalActive: number;
  completePercent: number;
  lastSyncedAt: string | null | undefined;
  onFilterToSingleProject: (projectKey: string) => void;
  onClearSelection: () => void;
}) {
  return (
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
            {lastSyncedAt && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                · Đồng bộ Jira lúc{" "}
                {new Date(lastSyncedAt).toLocaleTimeString("vi-VN", {
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
            onFilterToSingleProject={onFilterToSingleProject}
          />

          {selectedStdTasks.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Bỏ chọn tất cả
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Four clickable cards: missing Estimate/Points, Worklog, Fix Version, Due date. */
export function StandardizationMetricCards({
  missingCounts,
  stdMissingFilter,
  onToggle,
}: {
  missingCounts: Record<RequirementCode, number>;
  stdMissingFilter: StdMissingFilter;
  onToggle: (code: RequirementCode) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Estimation */}
      <button
        type="button"
        onClick={() =>
          onToggle("ESTIMATION")
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
          onToggle("WORKLOG")
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
          onToggle("FIX_VERSION")
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
          onToggle("DUE_DATE")
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
  );
}
