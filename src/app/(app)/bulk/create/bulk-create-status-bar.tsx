"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, CornerDownLeft } from "lucide-react";
import { MAX_BULK_CREATE_ITEMS } from "@/lib/bulk/create-types";

interface BulkCreateStatusBarProps {
  totalItems: number;
  filledItemsCount: number;
  totalErrors: number;
  totalWarnings: number;
  selectedCount: number;
  onGoToNextError: () => void;
}

export function BulkCreateStatusBar({
  totalItems,
  filledItemsCount,
  totalErrors,
  totalWarnings,
  selectedCount,
  onGoToNextError,
}: BulkCreateStatusBarProps) {
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border bg-card/85 px-4 text-xs select-none backdrop-blur-xs">
      {/* Left: Validation summary & Next error shortcut */}
      <div className="flex items-center gap-2.5">
        {totalErrors > 0 ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-medium text-destructive">
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{totalErrors} lỗi cần sửa</span>
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onGoToNextError}
              className="h-6 px-1.5 text-[11px] text-destructive hover:bg-destructive/10 cursor-pointer flex items-center gap-0.5"
            >
              <span>Tới dòng lỗi</span>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{filledItemsCount} task hợp lệ</span>
          </span>
        )}

        {totalWarnings > 0 && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 ml-1">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{totalWarnings} cảnh báo</span>
          </span>
        )}
      </div>

      {/* Middle: Subtle keyboard navigation helper */}
      <div className="hidden lg:flex items-center gap-4 text-[11px] text-muted-foreground/80">
        <span>
          <kbd className="rounded border border-border px-1 py-0.2 font-mono text-[10px] bg-muted/40">Tab</kbd> di chuyển ô
        </span>
        <span>
          <kbd className="rounded border border-border px-1 py-0.2 font-mono text-[10px] bg-muted/40">Ctrl+Enter</kbd> thêm dòng
        </span>
        <span>
          <kbd className="rounded border border-border px-1 py-0.2 font-mono text-[10px] bg-muted/40">Ctrl+D</kbd> nhân bản
        </span>
        <span>
          <kbd className="rounded border border-border px-1 py-0.2 font-mono text-[10px] bg-muted/40">Ctrl+V</kbd> dán Excel/Sheets
        </span>
      </div>

      {/* Right: Selection & count */}
      <div className="flex items-center gap-3">
        {selectedCount > 0 && (
          <span className="text-primary font-medium text-[11px]">
            Đã chọn {selectedCount} dòng
          </span>
        )}

        <span className="font-mono text-[11px] text-muted-foreground">
          {totalItems} / {MAX_BULK_CREATE_ITEMS} dòng
        </span>
      </div>
    </footer>
  );
}
