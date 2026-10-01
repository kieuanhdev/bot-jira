"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Inbox, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACTION_BY_REASON, type FocusMode, type StaleResponse, type Task } from "./lib/stale-types";
import { SeverityBadge } from "./stale-task-meta";

export function FocusCard({
  active,
  count,
  description,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  count: number;
  description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  onClick: () => void;
  tone: "danger" | "warning";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group min-w-0 cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "hover:border-primary/50 hover:bg-muted/30",
        active && "border-primary bg-primary/5 ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            tone === "danger"
              ? "bg-red-500/10 text-red-700 dark:text-red-400"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{count}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  );
}

export function InsightBrief({ data, staleRate }: { data: StaleResponse; staleRate: number }) {
  const topBottleneck = data.bottleneck[0];
  const topReason = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const task of data.tasks) {
      const current = counts.get(task.staleReason) ?? { label: task.staleReasonLabel, count: 0 };
      current.count += 1;
      counts.set(task.staleReason, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0];
  }, [data.tasks]);
  const healthLabel =
    staleRate >= 30 ? "Cần can thiệp ngay" : staleRate >= 15 ? "Đang tích tụ rủi ro" : "Trong tầm kiểm soát";
  const recommendation =
    data.summary.totalHigh > 0
      ? `Xử lý ${data.summary.totalHigh} task khẩn cấp trước, bắt đầu từ các mục quá hạn hoặc đang bị chặn.`
      : data.summary.totalBlocked > 0
      ? `Tổ chức tháo gỡ ${data.summary.totalBlocked} task bị chặn trước khi nhận thêm WIP.`
      : data.summary.totalNoAssignee > 0
      ? `Phân công chủ sở hữu cho ${data.summary.totalNoAssignee} task để tránh tiếp tục già hóa.`
      : "Ưu tiên các task vượt SLA lâu nhất và xác nhận bước tiếp theo với người xử lý.";
  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/[0.035] shadow-none">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="h-4 w-4" aria-hidden /> Tóm tắt điều hành
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{healthLabel}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{recommendation}</p>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Tỷ lệ task vượt SLA</span>
              <span className="font-semibold tabular-nums">{staleRate}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Tỷ lệ task vượt SLA"
              aria-valuenow={staleRate}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  staleRate >= 30 ? "bg-red-500" : staleRate >= 15 ? "bg-amber-500" : "bg-primary"
                )}
                style={{ width: `${Math.min(100, staleRate)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.summary.totalStale} trên {data.summary.totalActive} task đang hoạt động trong phạm vi chọn.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-lg border bg-background/70 p-3.5">
            <p className="text-xs text-muted-foreground">Điểm nghẽn lớn nhất</p>
            <p className="mt-1 truncate text-sm font-semibold">{topBottleneck?.status ?? "Chưa ghi nhận"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {topBottleneck
                ? `${topBottleneck.count} task · trung bình ${topBottleneck.avgStateAge} ngày`
                : "Không có dữ liệu"}
            </p>
          </div>
          <div className="rounded-lg border bg-background/70 p-3.5">
            <p className="text-xs text-muted-foreground">Nguyên nhân phổ biến nhất</p>
            <p className="mt-1 truncate text-sm font-semibold">{topReason?.label ?? "Chưa ghi nhận"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {topReason ? `${topReason.count} task cần cùng một kiểu can thiệp` : "Không có dữ liệu"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ActionQueue({ tasks, focus }: { tasks: Task[]; focus: FocusMode }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-primary" aria-hidden />{" "}
            {focus === "all" ? "Kế hoạch can thiệp hôm nay" : "Hàng đợi theo lăng kính đã chọn"}
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Xếp hạng minh bạch theo mức độ, quá hạn, bị chặn, thiếu người xử lý và số ngày vượt SLA.
          </CardDescription>
        </div>
        <Badge variant="outline" className="shrink-0">
          {Math.min(6, tasks.length)} việc đầu tiên
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">Không có task trong lăng kính này</p>
            <p className="text-xs text-muted-foreground">Chọn một lăng kính khác để tiếp tục phân loại.</p>
          </div>
        ) : (
          <div className="divide-y">
            {tasks.slice(0, 6).map((task, index) => (
              <Link
                key={task.jiraKey}
                href={`/issue/${task.jiraKey}`}
                className="group grid cursor-pointer gap-3 px-5 py-4 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground sm:flex">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">{task.jiraKey}</span>
                    <SeverityBadge severity={task.severity} />
                    {task.overdueDays > 0 && <Badge variant="danger">Quá hạn {task.overdueDays} ngày</Badge>}
                    {!task.assigneeJira && <Badge variant="warning">Chưa phân công</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium">{task.summary || "Task chưa đặt tên"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.status} · {task.assigneeJira ?? "Chưa có người xử lý"}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-semibold">
                      {ACTION_BY_REASON[task.staleReason] ?? "Kiểm tra bước tiếp theo"}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      {task.stateAgeDays}/{task.slaDays} ngày · vượt {task.overByDays} ngày
                    </p>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none"
                    aria-hidden
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgingDistribution({ tasks }: { tasks: Task[] }) {
  const bands = [
    { label: "Mới vượt", hint: "1–2 ngày", count: tasks.filter((task) => task.overByDays <= 2).length, color: "bg-sky-500" },
    { label: "Cần can thiệp", hint: "3–5 ngày", count: tasks.filter((task) => task.overByDays >= 3 && task.overByDays <= 5).length, color: "bg-amber-500" },
    { label: "Rủi ro cao", hint: "6–10 ngày", count: tasks.filter((task) => task.overByDays >= 6 && task.overByDays <= 10).length, color: "bg-orange-500" },
    { label: "Nợ kéo dài", hint: ">10 ngày", count: tasks.filter((task) => task.overByDays > 10).length, color: "bg-red-500" },
  ];
  const max = Math.max(1, ...bands.map((band) => band.count));
  return (
    <div className="space-y-4">
      {bands.map((band) => (
        <div key={band.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">
              {band.label} <span className="font-normal text-muted-foreground">· {band.hint}</span>
            </span>
            <span className="font-semibold tabular-nums">{band.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-200", band.color)}
              style={{ width: `${(band.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
