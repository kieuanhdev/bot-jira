"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ArrowRight,
  Loader2,
  Check,
  Plus,
  Maximize2,
  Minimize2,
  Keyboard,
  Info,
} from "lucide-react";
import { MAX_BULK_CREATE_ITEMS } from "@/lib/bulk/create-types";

interface BulkCreateStatusBarProps {
  totalItems: number;
  filledItemsCount: number;
  totalErrors: number;
  totalWarnings: number;
  selectedCount: number;
  onGoToNextError: () => void;
  onPreview?: () => void;
  isPreviewPending?: boolean;
  isSavingDraft?: boolean;
  draftSavedTime?: number | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onAddRow?: () => void;
  canAddRow?: boolean;
}

export function BulkCreateStatusBar({
  totalItems,
  filledItemsCount,
  totalErrors,
  totalWarnings,
  selectedCount,
  onGoToNextError,
  onPreview,
  isPreviewPending = false,
  isSavingDraft = false,
  draftSavedTime = null,
  isFullscreen = false,
  onToggleFullscreen,
  onAddRow,
  canAddRow = true,
}: BulkCreateStatusBarProps) {
  function formatSavedTime(ts: number | null) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }

  const canProceed = filledItemsCount > 0 && totalErrors === 0 && !isPreviewPending;

  return (
    <footer className="flex flex-col sm:flex-row sm:h-12 shrink-0 items-stretch sm:items-center justify-between border-t border-border bg-card/95 px-3 py-2 sm:py-0 text-xs select-none backdrop-blur-md gap-2 shadow-xs transition-colors">
      {/* Left: Validation summary, Next error shortcut & Autosave status */}
      <div className="flex flex-wrap items-center gap-2.5">
        {totalErrors > 0 ? (
          <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-destructive font-medium border border-destructive/20">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{totalErrors} lỗi cần sửa</span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onGoToNextError}
              className="h-5 px-1.5 text-[11px] text-destructive hover:bg-destructive/15 cursor-pointer flex items-center gap-0.5 ml-1"
            >
              <span>Tới lỗi</span>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        ) : filledItemsCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{filledItemsCount} task hợp lệ</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-muted-foreground text-xs px-1">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Nhập tiêu đề để bắt đầu</span>
          </div>
        )}

        {totalWarnings > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{totalWarnings} cảnh báo</span>
          </span>
        )}

        <div className="h-4 w-px bg-border hidden md:block" aria-hidden="true" />

        {/* Autosave status indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {isSavingDraft ? (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span>Đang lưu bản nháp…</span>
            </span>
          ) : draftSavedTime ? (
            <span className="flex items-center gap-1 text-muted-foreground/80">
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Đã lưu lúc {formatSavedTime(draftSavedTime)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground/50">Tự động lưu</span>
          )}
        </div>
      </div>

      {/* Middle: Subtle keyboard shortcuts (hidden on smaller screens) */}
      <div className="hidden xl:flex items-center gap-3 text-[11px] text-muted-foreground/70">
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px] bg-muted/60">Tab</kbd>
          <span>di chuyển</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px] bg-muted/60">Ctrl+Enter</kbd>
          <span>thêm dòng</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px] bg-muted/60">Ctrl+D</kbd>
          <span>nhân bản</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border px-1 py-0.5 font-mono text-[10px] bg-muted/60">Ctrl+V</kbd>
          <span>dán Excel</span>
        </span>
      </div>

      {/* Right: Selection count, Add row & Primary Preview CTA */}
      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Badge variant="info" className="text-[11px] font-mono px-2 py-0.5">
              Đã chọn {selectedCount}
            </Badge>
          )}

          <span className="font-mono text-[11px] text-muted-foreground">
            {totalItems}/{MAX_BULK_CREATE_ITEMS}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onAddRow && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddRow}
              disabled={!canAddRow}
              title="Thêm dòng mới (Ctrl+Enter)"
              className="h-8 px-2.5 text-xs cursor-pointer text-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5 sm:mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">Thêm dòng</span>
            </Button>
          )}

          {onToggleFullscreen && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Thu nhỏ về trang thường" : "Mở toàn màn hình"}
              className="h-8 w-8 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          )}

          {onPreview && (
            <Button
              type="button"
              size="sm"
              onClick={onPreview}
              disabled={!canProceed}
              title={
                filledItemsCount === 0
                  ? "Hãy nhập ít nhất một dòng tiêu đề task"
                  : totalErrors > 0
                    ? `Vui lòng sửa ${totalErrors} lỗi trước khi tiếp tục`
                    : "Chuyển sang bước Xem trước & Xác nhận"
              }
              className={`h-8 gap-1.5 px-3 text-xs font-semibold cursor-pointer shadow-xs transition-all duration-150 ${
                canProceed
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-sm hover:translate-y-[-1px]"
                  : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed"
              }`}
            >
              {isPreviewPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <>
                  <span>Xem trước {filledItemsCount > 0 ? `(${filledItemsCount})` : ""}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}
