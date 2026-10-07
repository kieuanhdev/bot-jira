import { timeAgo } from "@/lib/utils";
import { AlertTriangle, EyeOff } from "lucide-react";
import type { BoardColumn } from "./lib/board-columns";

/** Warning shown when the last successful Jira sync is stale. */
export function StaleSyncBanner({ lastSuccessAt }: { lastSuccessAt: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Dữ liệu Jira chưa được đồng bộ mới</p>
        <p className="text-xs opacity-90">
          Đồng bộ thành công lần cuối: {lastSuccessAt ? timeAgo(lastSuccessAt) : "chưa từng"}.
          Hãy xếp hàng đồng bộ hoặc kiểm tra worker trước khi ra quyết định phát hành.
        </p>
      </div>
    </div>
  );
}

/** Lists the hidden board columns with one-click restore. */
export function HiddenColumnsBanner({
  columns,
  hiddenCols,
  onShowColumn,
  onShowAll,
}: {
  columns: BoardColumn[];
  hiddenCols: Set<string>;
  onShowColumn: (key: string) => void;
  onShowAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-900 dark:text-amber-200">
      <div className="flex flex-wrap items-center gap-1.5">
        <EyeOff className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        <span className="font-semibold">Đang ẩn {hiddenCols.size} cột:</span>
        {columns
          .filter((c) => hiddenCols.has(c.key))
          .map((c) => (
            <button
              key={c.key}
              onClick={() => onShowColumn(c.key)}
              title={`Bấm để hiện lại cột ${c.label}`}
              className="inline-flex cursor-pointer items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-amber-500/30"
            >
              <span>+ {c.label}</span>
            </button>
          ))}
      </div>
      <button
        onClick={onShowAll}
        className="cursor-pointer shrink-0 font-medium underline underline-offset-2 hover:text-foreground"
      >
        Hiện lại tất cả
      </button>
    </div>
  );
}
