import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IssueItem } from "@/hooks/use-issues";
import { cn } from "@/lib/utils";
import {
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import type { BoardColumn } from "./lib/board-columns";
import type { ViewMode } from "./lib/board-types";
import { statusDot } from "./lib/board-utils";

interface BoardColumnsMenuProps {
  effectiveView: ViewMode;
  columns: BoardColumn[];
  visibleColumns: BoardColumn[];
  byColumn: Map<string, IssueItem[]>;
  hiddenCols: Set<string>;
  collapsedCols: Set<string>;
  hiddenTableCols: Set<string>;
  selectedProject: string;
  onShowAll: () => void;
  onHideEmpty: () => void;
  onToggleColumn: (key: string) => void;
  onCollapseEmpty: () => void;
  onExpandAll: () => void;
  onResetColumns: () => void;
  onToggleTableColumn: (key: string) => void;
  onResetTableColumns: () => void;
}

/** "Tùy chỉnh cột" dropdown: board columns in board view, table fields in list view. */
export function BoardColumnsMenu({
  effectiveView,
  columns,
  visibleColumns,
  byColumn,
  hiddenCols,
  collapsedCols,
  hiddenTableCols,
  selectedProject,
  onShowAll,
  onHideEmpty,
  onToggleColumn,
  onCollapseEmpty,
  onExpandAll,
  onResetColumns,
  onToggleTableColumn,
  onResetTableColumns,
}: BoardColumnsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 cursor-pointer gap-1.5 font-medium transition-colors",
            effectiveView === "board" && hiddenCols.size > 0
              ? "border-amber-500/50 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 dark:text-amber-200"
              : effectiveView === "list" && hiddenTableCols.size > 0
              ? "border-amber-500/50 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 dark:text-amber-200"
              : ""
          )}
          aria-label="Tùy chỉnh ẩn/hiện cột"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          <span>Tùy chỉnh cột</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums font-semibold",
              effectiveView === "board" && hiddenCols.size > 0
                ? "bg-amber-500/25 text-amber-950 dark:text-amber-100"
                : effectiveView === "list" && hiddenTableCols.size > 0
                ? "bg-amber-500/25 text-amber-950 dark:text-amber-100"
                : "bg-muted text-muted-foreground"
            )}
          >
            {effectiveView === "board"
              ? hiddenCols.size > 0
                ? `Ẩn ${hiddenCols.size}`
                : `${visibleColumns.length}/${columns.length}`
              : hiddenTableCols.size > 0
              ? `Ẩn ${hiddenTableCols.size}`
              : "Đầy đủ"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 shadow-lg">
        {effectiveView === "board" ? (
          <>
            <div className="border-b border-border/50 px-3 py-2">
              <div className="flex items-center justify-between">
                <DropdownMenuLabel className="p-0 text-sm font-semibold">Tùy chỉnh hiển thị cột</DropdownMenuLabel>
                <span className="text-[11px] font-medium text-muted-foreground">
                  Hiện {visibleColumns.length}/{columns.length} cột
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Bật/tắt cột để tùy biến bảng. Lưu riêng cho dự án {selectedProject}.
              </p>
            </div>

            <div className="flex items-center justify-between gap-1 border-b border-border/40 bg-muted/30 p-1.5 text-xs">
              <button
                onClick={onShowAll}
                disabled={hiddenCols.size === 0}
                className="flex-1 cursor-pointer rounded px-2 py-1 text-center font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Hiện tất cả ({columns.length})
              </button>
              <span className="text-border">|</span>
              <button
                onClick={onHideEmpty}
                className="flex-1 cursor-pointer rounded px-2 py-1 text-center font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Ẩn cột trống
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {columns.map((column) => {
                const visible = !hiddenCols.has(column.key);
                const isOnlyVisible = visible && visibleColumns.length === 1;
                const count = byColumn.get(column.key)?.length ?? 0;
                return (
                  <div
                    key={column.key}
                    onClick={() => {
                      if (!isOnlyVisible) onToggleColumn(column.key);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer select-none",
                      visible ? "hover:bg-accent/80" : "opacity-60 hover:bg-muted/60 hover:opacity-100",
                      isOnlyVisible && "cursor-not-allowed"
                    )}
                    title={
                      isOnlyVisible
                        ? "Cần giữ ít nhất 1 cột hiển thị"
                        : visible
                        ? `Bấm để ẩn cột ${column.label}`
                        : `Bấm để hiện cột ${column.label}`
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Checkbox
                        checked={visible}
                        disabled={isOnlyVisible}
                        className="h-3.5 w-3.5 pointer-events-none"
                      />
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot(column.category, 0))} />
                      <span
                        className={cn(
                          "truncate font-medium",
                          !visible && "line-through text-muted-foreground"
                        )}
                      >
                        {column.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground font-medium">
                        {count}
                      </span>
                      {visible ? (
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <DropdownMenuSeparator className="my-0" />
            <div className="p-1 text-xs">
              <DropdownMenuItem
                onSelect={onCollapseEmpty}
                className="cursor-pointer gap-2 py-1.5 text-xs"
              >
                <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                <span>Thu gọn các cột trống (thanh đứng)</span>
              </DropdownMenuItem>
              {collapsedCols.size > 0 && (
                <DropdownMenuItem
                  onSelect={onExpandAll}
                  className="cursor-pointer gap-2 py-1.5 text-xs"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  <span>Mở rộng tất cả cột đang thu gọn</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={onResetColumns}
                disabled={hiddenCols.size === 0 && collapsedCols.size === 0}
                className="cursor-pointer gap-2 py-1.5 text-xs text-muted-foreground focus:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span>Khôi phục thiết lập mặc định</span>
              </DropdownMenuItem>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-border/50 px-3 py-2">
              <DropdownMenuLabel className="p-0 text-sm font-semibold">Cột trong danh sách</DropdownMenuLabel>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                Chọn các trường thông tin bạn muốn hiển thị trên bảng danh sách.
              </p>
            </div>
            <div className="p-1.5">
              {[
                { key: "status", label: "Trạng thái (Status)" },
                { key: "assignee", label: "Người xử lý (Assignee)" },
                { key: "priority", label: "Mức ưu tiên (Priority)" },
                { key: "updated", label: "Thời gian cập nhật (Updated)" },
              ].map((col) => {
                const visible = !hiddenTableCols.has(col.key);
                return (
                  <div
                    key={col.key}
                    onClick={() => onToggleTableColumn(col.key)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer select-none",
                      visible ? "hover:bg-accent/80" : "opacity-60 hover:bg-muted/60 hover:opacity-100"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={visible} className="h-3.5 w-3.5 pointer-events-none" />
                      <span className={cn("font-medium", !visible && "line-through text-muted-foreground")}>
                        {col.label}
                      </span>
                    </div>
                    {visible ? (
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
            {hiddenTableCols.size > 0 && (
              <>
                <DropdownMenuSeparator className="my-0" />
                <div className="p-1 text-xs">
                  <DropdownMenuItem
                    onSelect={onResetTableColumns}
                    className="cursor-pointer gap-2 py-1.5 text-xs text-muted-foreground focus:text-foreground"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    <span>Hiện tất cả các cột</span>
                  </DropdownMenuItem>
                </div>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
