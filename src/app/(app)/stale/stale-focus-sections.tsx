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
import { AgingDistribution, FocusCard } from "./stale-team-sections";

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
    <section aria-labelledby="focus-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="focus-heading" className="text-base font-semibold">
            Lăng kính ưu tiên
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Chọn một nhóm để thu hẹp hàng đợi hành động và danh sách chi tiết.
          </p>
        </div>
        {focus !== "all" && (
          <Button
            className="cursor-pointer"
            variant="ghost"
            size="sm"
            onClick={onClearFocus}
          >
            <X aria-hidden /> Bỏ lăng kính
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FocusCard
          active={focus === "high"}
          count={focusCounts.high}
          description="Mức độ cao, cần xác nhận chủ sở hữu và bước tiếp theo ngay."
          icon={ShieldAlert}
          label="Khẩn cấp"
          onClick={() => onSelectFocus("high")}
          tone="danger"
        />
        <FocusCard
          active={focus === "blocked"}
          count={focusCounts.blocked}
          description="Không thể tiến triển nếu phụ thuộc hoặc quyết định chưa được tháo gỡ."
          icon={Lock}
          label="Đang bị chặn"
          onClick={() => onSelectFocus("blocked")}
          tone="danger"
        />
        <FocusCard
          active={focus === "overdue"}
          count={focusCounts.overdue}
          description="Đã vượt hạn bàn giao, cần thương lượng lại phạm vi hoặc thời hạn."
          icon={CalendarX}
          label="Đã quá hạn"
          onClick={() => onSelectFocus("overdue")}
          tone="warning"
        />
        <FocusCard
          active={focus === "unassigned"}
          count={focusCounts.unassigned}
          description="Chưa có người chịu trách nhiệm nên nguy cơ tiếp tục già hóa cao."
          icon={UserRoundX}
          label="Chưa phân công"
          onClick={() => onSelectFocus("unassigned")}
          tone="warning"
        />
      </div>
    </section>
  );
}

/** Bottleneck, aging and support cards. */
export function StaleDiagnosticsSection({
  data,
  onSelectStatus,
  onSelectAssignee,
  onSelectFocus,
}: {
  data: StaleResponse;
  onSelectStatus: (status: string) => void;
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
              Bấm một trạng thái để lọc toàn bộ phân tích.
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
                  className="w-full cursor-pointer rounded-md p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {data.support.slice(0, 6).map((entry) => (
              <button
                key={entry.assignee}
                type="button"
                onClick={() =>
                  entry.assignee === "(unassigned)"
                    ? onSelectFocus("unassigned")
                    : onSelectAssignee(entry.assignee)
                }
                className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-md p-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
