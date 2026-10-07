import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Clock3, ListChecks, User, Users } from "lucide-react";
import type { StaleResponse } from "./lib/stale-types";

type CountTone = "warning" | "danger" | "success" | "muted";

const COUNT_TONES: Record<CountTone, string> = {
  warning: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  danger: "bg-red-500/20 text-red-700 dark:text-red-400",
  success: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground",
};

function SegmentButton({
  active,
  onClick,
  icon,
  label,
  count,
  tone = "muted",
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  count?: ReactNode;
  tone?: CountTone;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className={cn("ml-1 rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums", COUNT_TONES[tone])}>
          {count}
        </span>
      )}
    </button>
  );
}

export function StaleViewSwitcher({
  viewMode,
  activeTab,
  data,
  incompleteCount,
  onViewModeChange,
  onTabChange,
}: {
  viewMode: "my-work" | "team";
  activeTab: "standardization" | "stale";
  data: StaleResponse | undefined;
  incompleteCount: number;
  onViewModeChange: (mode: "my-work" | "team") => void;
  onTabChange: (tab: "standardization" | "stale") => void;
}) {
  const myWork = data?.myWork;
  const myStale = myWork?.totalStale ?? 0;
  // While "Việc của tôi" is open the sub-tabs already show these numbers, so only badge it from the team view.
  const showMyBadge = viewMode !== "my-work" && myWork;

  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" role="group" aria-label="Góc nhìn phân tích">
        <SegmentButton
          active={viewMode === "my-work"}
          onClick={() => onViewModeChange("my-work")}
          icon={<User className="h-3.5 w-3.5" aria-hidden />}
          label="Việc của tôi"
          count={showMyBadge ? (incompleteCount > 0 ? `${incompleteCount} thiếu chuẩn` : `${myStale} tồn đọng`) : undefined}
          tone={incompleteCount > 0 || myStale > 0 ? "warning" : "success"}
        />
        <SegmentButton
          active={viewMode === "team"}
          onClick={() => onViewModeChange("team")}
          icon={<Users className="h-3.5 w-3.5" aria-hidden />}
          label="Toàn dự án"
          count={data?.summary?.totalStale}
        />
      </div>

      {viewMode === "my-work" && (
        <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" role="group" aria-label="Phân loại việc của tôi">
          <SegmentButton
            active={activeTab === "standardization"}
            onClick={() => onTabChange("standardization")}
            icon={<ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden />}
            label="Cần chuẩn hóa"
            count={incompleteCount > 0 ? incompleteCount : "Đạt chuẩn"}
            tone={incompleteCount > 0 ? "warning" : "success"}
          />
          <SegmentButton
            active={activeTab === "stale"}
            onClick={() => onTabChange("stale")}
            icon={<Clock3 className="h-3.5 w-3.5" aria-hidden />}
            label="Tồn đọng (SLA)"
            count={myWork ? myStale : undefined}
            tone={myStale > 0 ? "danger" : "success"}
          />
        </div>
      )}
    </div>
  );
}
