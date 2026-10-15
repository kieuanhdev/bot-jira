"use client";

import { SlidersHorizontal } from "lucide-react";
import type { SyncPreset } from "@/lib/jira/sync-features-shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SyncBulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onApplyPreset: (preset: Exclude<SyncPreset, "custom">) => void;
  disabled?: boolean;
}

export function SyncBulkBar({
  selectedCount,
  onClearSelection,
  onApplyPreset,
  disabled,
}: SyncBulkBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 shadow-sm transition-all duration-150">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          Đã chọn {selectedCount} dự án
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          onClick={onClearSelection}
        >
          Bỏ chọn
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="cursor-pointer gap-1.5 shadow-sm" disabled={disabled}>
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              Áp preset cho {selectedCount} dự án
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="cursor-pointer flex-col items-start py-2"
              onClick={() => onApplyPreset("full")}
            >
              <span className="font-medium">Đầy đủ (mặc định)</span>
              <span className="text-xs text-muted-foreground">Bật toàn bộ 9 hạng mục</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer flex-col items-start py-2"
              onClick={() => onApplyPreset("issues_comments")}
            >
              <span className="font-medium">Issue + bình luận</span>
              <span className="text-xs text-muted-foreground">
                Bình luận, workflow, trường người dùng, deletions, notifications
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer flex-col items-start py-2"
              onClick={() => onApplyPreset("issues_only")}
            >
              <span className="font-medium">Chỉ issue</span>
              <span className="text-xs text-muted-foreground">
                Chỉ cập nhật issue, workflow và deletions
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
