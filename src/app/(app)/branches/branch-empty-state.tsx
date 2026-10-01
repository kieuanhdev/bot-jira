"use client";

import { GitBranch, FilterX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type BranchEmptyStateProps = {
  hasFilters: boolean;
  onResetFilters: () => void;
};

/**
 * Domain wrapper over the shared EmptyState. Keeps branch-specific copy and the
 * "clear filters" affordance while sharing the standard empty-state shell.
 */
export function BranchEmptyState({ hasFilters, onResetFilters }: BranchEmptyStateProps) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={FilterX}
        title="Không tìm thấy nhánh phù hợp"
        hint="Không có nhánh nào khớp với từ khóa tìm kiếm và bộ lọc hiện tại. Hãy thử điều chỉnh hoặc xóa bộ lọc."
        action={
          <Button variant="outline" size="sm" onClick={onResetFilters} className="text-xs">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Xóa tất cả bộ lọc
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={GitBranch}
      title="Chưa có nhánh nào được theo dõi"
      hint={
        <>
          Cấu hình <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">BITBUCKET_REPOS</code>{" "}
          trong tệp cấu hình để bắt đầu đồng bộ các nhánh.
        </>
      }
    />
  );
}
