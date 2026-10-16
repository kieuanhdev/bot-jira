"use client";

import { Check, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface NotificationsBatchBarProps {
  selectedCount: number;
  isAllSelected: boolean;
  onToggleSelectAll: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
  isMarkPending: boolean;
  isDeleting: boolean;
}

export function NotificationsBatchBar({
  selectedCount,
  isAllSelected,
  onToggleSelectAll,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onClearSelection,
  isMarkPending,
  isDeleting,
}: NotificationsBatchBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="sticky top-16 z-30 flex items-center justify-between gap-3 p-3 rounded-xl bg-card border-2 border-primary shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isAllSelected}
          onCheckedChange={onToggleSelectAll}
          aria-label="Chọn hoặc bỏ chọn tất cả"
        />
        <span className="text-xs sm:text-sm font-semibold text-foreground">
          Đã chọn <span className="text-primary tabular-nums">{selectedCount}</span> thông báo
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMarkRead}
          disabled={isMarkPending}
          className="cursor-pointer gap-1 text-xs h-8 text-foreground hover:border-primary"
        >
          <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
          <span className="hidden sm:inline">Đánh dấu đã đọc</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onMarkUnread}
          disabled={isMarkPending}
          className="cursor-pointer gap-1 text-xs h-8 text-foreground hover:border-primary"
        >
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="hidden sm:inline">Đánh dấu chưa đọc</span>
        </Button>

        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          className="cursor-pointer gap-1 text-xs h-8"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Xóa ({selectedCount})</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClearSelection}
          className="cursor-pointer h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Bỏ chọn tất cả"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
