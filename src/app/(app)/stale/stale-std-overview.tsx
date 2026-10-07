import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RequirementCode } from "@/lib/issues/standardization";
import { cn } from "@/lib/utils";
import { CalendarClock, Check, Clock3, Hash, Layers, UserRoundX, type LucideIcon } from "lucide-react";
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
}: {
  allStdTasks: StandardizationTask[];
  selectedStdTasks: Set<string>;
  incompleteCount: number;
  completeCount: number;
  totalActive: number;
  completePercent: number;
  lastSyncedAt: string | null | undefined;
  onFilterToSingleProject: (projectKey: string) => void;
}) {
  return (
    <Card className="border-primary/20 bg-primary/[0.035] shadow-none">
      <CardContent className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
          <p className="text-xs text-muted-foreground max-w-2xl">
            {incompleteCount > 0
              ? "Thiếu Estimate/Points, Worklog, Fix Version hoặc Due date theo chính sách. Bổ sung để dự báo chính xác hơn."
              : "Mọi task bạn phụ trách đã đủ Estimate/Points, Worklog, Fix Version và Due date."}
          </p>

          {totalActive > 0 && (
            <div className="pt-2 max-w-md">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Tiến độ chuẩn hóa</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {completePercent}% ({completeCount}/{totalActive})
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Tiến độ chuẩn hóa"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={completePercent}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
                    completePercent === 100 ? "bg-emerald-500" : "bg-primary"
                  )}
                  style={{ width: `${completePercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="shrink-0">
          <BulkStandardizationAction
            selectedKeys={selectedStdTasks}
            allTasks={allStdTasks}
            incompleteCount={incompleteCount}
            onFilterToSingleProject={onFilterToSingleProject}
          />

        </div>
      </CardContent>
    </Card>
  );
}

const METRICS: {
  code: RequirementCode;
  label: string;
  icon: LucideIcon;
  tone: string;
  missing: string;
  done: string;
}[] = [
  { code: "ESTIMATION", label: "Estimate / Points", icon: Hash, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400", missing: "Task thiếu điểm / estimate", done: "Đã đủ điểm / estimate" },
  { code: "WORKLOG", label: "Worklog", icon: Clock3, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400", missing: "Chưa ghi nhận thời gian", done: "Đã có worklog" },
  { code: "FIX_VERSION", label: "Fix Version", icon: Layers, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-400", missing: "Chưa gán bản phát hành", done: "Đã gán phiên bản" },
  { code: "DUE_DATE", label: "Due date", icon: CalendarClock, tone: "bg-orange-500/10 text-orange-700 dark:text-orange-400", missing: "Chưa đặt hạn hoàn thành", done: "Đã có hạn hoàn thành" },
];

/** Four clickable toggle cards: they double as the "missing field" filter for the queue below. */
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Lọc theo tiêu chuẩn còn thiếu">
      {METRICS.map(({ code, label, icon: Icon, tone, missing, done }) => {
        const count = missingCounts[code];
        const active = stdMissingFilter === code;
        return (
          <button
            key={code}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(code)}
            className={cn(
              "cursor-pointer rounded-lg border bg-card p-3.5 text-left transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-primary bg-primary/5 ring-1 ring-primary/20"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground">{label}</span>
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", count === 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : tone)}>
                {count === 0 ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
              </span>
            </div>
            <p className={cn("mt-1.5 text-2xl font-bold tabular-nums tracking-tight", count === 0 && "text-muted-foreground")}>
              {count}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{count > 0 ? missing : done}</p>
          </button>
        );
      })}
    </div>
  );
}
