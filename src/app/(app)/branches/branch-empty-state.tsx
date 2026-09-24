"use client";

import { GitBranch, FilterX, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type BranchEmptyStateProps = {
  hasFilters: boolean;
  onResetFilters: () => void;
};

export function BranchEmptyState({ hasFilters, onResetFilters }: BranchEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FilterX className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Không tìm thấy nhánh phù hợp</h3>
          <p className="max-w-sm text-xs text-muted-foreground">
            Không có nhánh nào khớp với từ khóa tìm kiếm và bộ lọc hiện tại. Hãy thử điều chỉnh hoặc xóa bộ lọc.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onResetFilters} className="mt-2 text-xs">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Xóa tất cả bộ lọc
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <GitBranch className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Chưa có nhánh nào được theo dõi</h3>
        <p className="max-w-sm text-xs text-muted-foreground">
          Cấu hình <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">BITBUCKET_REPOS</code> trong tệp cấu hình để bắt đầu đồng bộ các nhánh.
        </p>
      </div>
    </div>
  );
}
