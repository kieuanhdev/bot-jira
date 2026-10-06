import { Layers, PlayCircle, CheckCircle2, AlertOctagon, ArrowRight, X } from "lucide-react";
import { REPORT_STATUS_STYLE } from "@/lib/reports/status";
import type { ReportStatusGroup } from "@/lib/reports/types";
import type { StageStats } from "./model";

/** Notice pill shown while the user hides some status groups. */
export function HiddenGroupsNotice({
  hiddenGroups,
  onShowAll,
}: {
  hiddenGroups: ReportStatusGroup[];
  onShowAll: () => void;
}) {
  return (
    <div className="mt-2.5 flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
      <span className="text-[11px]">
        Đang ẩn <strong>{hiddenGroups.length}</strong> trạng thái khỏi biểu đồ (
        {hiddenGroups.map((g) => REPORT_STATUS_STYLE[g]?.label || g).join(", ")})
      </span>
      <button
        type="button"
        onClick={onShowAll}
        className="text-[11px] font-semibold underline hover:opacity-80 cursor-pointer shrink-0 ml-2"
      >
        Hiện lại tất cả
      </button>
    </div>
  );
}

/** Delivery stage high-level overview strip. */
export function StageSummaryStrip({ stageStats, unitLabel }: { stageStats: StageStats; unitLabel: string }) {
  return (
    <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {/* 1. Tồn đọng (Backlog + To Do) */}
      <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Layers className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">Chờ làm</span>
            <span className="font-semibold tabular-nums">{stageStats.backlog.pct}%</span>
          </div>
          <p className="truncate text-sm font-bold text-foreground">
            {stageStats.backlog.val}{" "}
            <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
          </p>
        </div>
      </div>

      {/* 2. Đang làm (WIP) */}
      <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <PlayCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">Đang làm (WIP)</span>
            <span className="font-semibold tabular-nums">{stageStats.wip.pct}%</span>
          </div>
          <p className="truncate text-sm font-bold text-foreground">
            {stageStats.wip.val}{" "}
            <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
          </p>
        </div>
      </div>

      {/* 3. Bị nghẽn (Blocked) */}
      <div
        className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
          stageStats.blocked.count > 0
            ? "border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10"
            : "border-border/80 bg-muted/40 hover:bg-muted/70"
        }`}
      >
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
            stageStats.blocked.count > 0
              ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <AlertOctagon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">Bị nghẽn</span>
            {stageStats.blocked.count > 0 && (
              <span className="inline-flex items-center rounded px-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10">
                Cần gỡ
              </span>
            )}
          </div>
          <p
            className={`truncate text-sm font-bold ${
              stageStats.blocked.count > 0
                ? "text-rose-600 dark:text-rose-400"
                : "text-foreground"
            }`}
          >
            {stageStats.blocked.val}{" "}
            <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
          </p>
        </div>
      </div>

      {/* 4. Hoàn thành (Done) */}
      <div className="flex items-center gap-2.5 rounded-lg border border-border/80 bg-muted/40 p-2.5 transition-colors hover:bg-muted/70">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span className="truncate">Hoàn thành</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {stageStats.done.pct}%
            </span>
          </div>
          <p className="truncate text-sm font-bold text-foreground">
            {stageStats.done.val}{" "}
            <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Filter bar shown while a status group is selected. */
export function SelectedGroupBar({
  selectedGroup,
  selectedCount,
  onSelectGroup,
  onDrillDownToTasks,
  onClearFilter,
}: {
  selectedGroup: ReportStatusGroup;
  selectedCount: number;
  onSelectGroup?: (group: ReportStatusGroup | null) => void;
  onDrillDownToTasks?: (group: ReportStatusGroup) => void;
  onClearFilter: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            REPORT_STATUS_STYLE[selectedGroup]?.dot || "bg-teal-500"
          }`}
          aria-hidden="true"
        />
        <span className="text-foreground truncate">
          Đang lọc nhóm:{" "}
          <strong className="font-semibold">
            {REPORT_STATUS_STYLE[selectedGroup]?.label || selectedGroup}
          </strong>{" "}
          (
          {selectedCount} task
          )
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {(onDrillDownToTasks || onSelectGroup) && (
          <button
            type="button"
            onClick={() => {
              if (onDrillDownToTasks && selectedGroup) {
                onDrillDownToTasks(selectedGroup);
              } else if (onSelectGroup) {
                onSelectGroup(selectedGroup);
              }
            }}
            className="inline-flex items-center gap-1 font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
          >
            <span>Xem trong tab Công việc</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClearFilter}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          title="Bỏ lọc nhóm"
        >
          <X className="h-3.5 w-3.5" />
          <span>Bỏ lọc</span>
        </button>
      </div>
    </div>
  );
}
