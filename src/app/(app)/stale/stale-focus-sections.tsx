"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  CalendarX,
  ChevronRight,
  CircleGauge,
  Lock,
  ShieldAlert,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
import { type FocusMode, GROUP_DOT, type StaleResponse } from "./lib/stale-types";
import { AgingDistribution } from "./stale-team-sections";

const FOCUS_CHIPS: {
  mode: Exclude<FocusMode, "all">;
  label: string;
  hint: string;
  icon: typeof ShieldAlert;
  tone: string;
}[] = [
  { mode: "high", label: "Khẩn cấp", hint: "Mức độ cao, cần xác nhận chủ sở hữu và bước tiếp theo ngay.", icon: ShieldAlert, tone: "text-red-700 dark:text-red-400" },
  { mode: "blocked", label: "Đang bị chặn", hint: "Không thể tiến triển nếu phụ thuộc hoặc quyết định chưa được tháo gỡ.", icon: Lock, tone: "text-red-700 dark:text-red-400" },
  { mode: "overdue", label: "Đã quá hạn", hint: "Đã vượt hạn bàn giao, cần thương lượng lại phạm vi hoặc thời hạn.", icon: CalendarX, tone: "text-amber-700 dark:text-amber-400" },
  { mode: "unassigned", label: "Chưa phân công", hint: "Chưa có người chịu trách nhiệm nên nguy cơ tiếp tục già hóa cao.", icon: UserRoundX, tone: "text-amber-700 dark:text-amber-400" },
];

/** One-line lens chips (replaces four large cards); picking one narrows the queue and the list below. */
export function StaleFocusSection({
  focus,
  focusCounts,
  onClearFocus,
  onSelectFocus,
}: {
  focus: FocusMode;
  focusCounts: Record<Exclude<FocusMode, "all">, number>;
  onClearFocus: () => void;
  onSelectFocus: (focus: FocusMode) => void;
}) {
  return (
    <section aria-label="Lăng kính ưu tiên" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold text-muted-foreground">Lăng kính:</span>
      {FOCUS_CHIPS.map(({ mode, label, hint, icon: Icon, tone }) => {
        const active = focus === mode;
        return (
          <button
            key={mode}
            type="button"
            title={hint}
            aria-pressed={active}
            onClick={() => onSelectFocus(mode)}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium transition-colors duration-150 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-primary bg-primary/5 ring-1 ring-primary/20"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", tone)} aria-hidden />
            {label}
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4 tabular-nums">
              {focusCounts[mode]}
            </span>
          </button>
        );
      })}
      {focus !== "all" && (
        <Button className="h-8 cursor-pointer" variant="ghost" size="sm" onClick={onClearFocus}>
          <X aria-hidden /> Bỏ lăng kính
        </Button>
      )}
    </section>
  );
}

/** Always-open section wrapper for the deeper analysis cards. */
export function StaleDeepDive({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="deep-dive-heading" className="space-y-4">
      <div>
        <h2 id="deep-dive-heading" className="text-base font-semibold">
          Phân tích chuyên sâu
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Điểm nghẽn quy trình, tuổi tồn đọng, nơi cần hỗ trợ, WIP và chất lượng dữ liệu
        </p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

/** Bottleneck, aging and support cards. */
export function StaleDiagnosticsSection({
  data,
  focus,
  bottleneckStatus,
  onSelectStatus,
  supportAssignee,
  onSelectAssignee,
  onSelectFocus,
}: {
  data: StaleResponse;
  focus: FocusMode;
  bottleneckStatus: string | null;
  onSelectStatus: (status: string) => void;
  supportAssignee: string | null;
  onSelectAssignee: (assignee: string) => void;
  onSelectFocus: (focus: FocusMode) => void;
}) {
  return (
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
              Bấm một trạng thái để lọc danh sách chi tiết.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.bottleneck.slice(0, 6).map((item) => {
              const max = data.bottleneck[0]?.count || 1;
              return (
                <button
                  key={item.status}
                  type="button"
                  onClick={() => onSelectStatus(item.status)}
                  aria-pressed={item.status === bottleneckStatus}
                  className={cn(
                    "w-full cursor-pointer rounded-md p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    item.status === bottleneckStatus && "bg-primary/5 ring-1 ring-primary/30"
                  )}
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
            {data.support.slice(0, 6).map((entry) => {
              const isActiveEntry =
                entry.assignee === "(unassigned)" ? focus === "unassigned" : entry.assignee === supportAssignee;
              return (
              <button
                key={entry.assignee}
                type="button"
                onClick={() =>
                  entry.assignee === "(unassigned)"
                    ? onSelectFocus("unassigned")
                    : onSelectAssignee(entry.assignee)
                }
                aria-pressed={isActiveEntry}
                className={cn(
                  "group flex w-full cursor-pointer items-center justify-between gap-3 rounded-md p-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActiveEntry && "bg-primary/5 ring-1 ring-primary/30"
                )}
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
              );
            })}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
