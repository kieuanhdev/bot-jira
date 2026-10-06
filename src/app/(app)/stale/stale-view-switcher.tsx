import { cn } from "@/lib/utils";
import { Clock3, ListChecks, User, Users } from "lucide-react";
import type { StaleResponse } from "./lib/stale-types";

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
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" aria-label="Góc nhìn phân tích">
        <button
          type="button"
          aria-pressed={viewMode === "my-work"}
          onClick={() => onViewModeChange("my-work")}
          className={cn(
            "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
            viewMode === "my-work"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <User className="h-3.5 w-3.5" aria-hidden="true" />
          Việc của tôi
          {data?.myWork && (
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
                incompleteCount > 0 || data.myWork.totalStale > 0
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                  : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              )}
            >
              {incompleteCount > 0 ? `${incompleteCount} thiếu chuẩn` : `${data.myWork.totalStale} tồn đọng`}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "team"}
          onClick={() => onViewModeChange("team")}
          className={cn(
            "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
            viewMode === "team"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          Toàn dự án
          {data?.summary && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {data.summary.totalStale}
            </span>
          )}
        </button>
      </div>

      {/* In My Work view: Secondary Content Tabs */}
      {viewMode === "my-work" && (
        <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" aria-label="Phân loại việc của tôi">
          <button
            type="button"
            aria-pressed={activeTab === "standardization"}
            onClick={() => onTabChange("standardization")}
            className={cn(
              "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
              activeTab === "standardization"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Cần chuẩn hóa
            {incompleteCount > 0 ? (
              <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {incompleteCount}
              </span>
            ) : (
              <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                Đạt chuẩn
              </span>
            )}
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "stale"}
            onClick={() => onTabChange("stale")}
            className={cn(
              "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
              activeTab === "stale"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            Tồn đọng (SLA)
            {data?.myWork && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
                  data.myWork.totalStale > 0
                    ? "bg-red-500/20 text-red-600 dark:text-red-400"
                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                )}
              >
                {data.myWork.totalStale}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
