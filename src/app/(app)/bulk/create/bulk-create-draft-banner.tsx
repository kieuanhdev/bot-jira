"use client";

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export interface BulkCreateDraftBannerProps {
  projectKey: string;
  onRestore: () => void;
  onDiscard: () => void;
}

export function BulkCreateDraftBanner({
  projectKey,
  onRestore,
  onDiscard,
}: BulkCreateDraftBannerProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-2xs animate-in fade-in duration-200">
      <div className="flex items-center gap-2.5 text-xs">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <div className="font-semibold text-foreground">
            Tìm thấy bản nháp chưa hoàn tất cho dự án {projectKey}
          </div>
          <div className="text-muted-foreground text-[11px]">
            Bạn có muốn khôi phục lại danh sách task và cài đặt mặc định đã soạn thảo từ phiên trước? Khôi phục sẽ thay thế danh sách hiện tại.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <Button
          type="button"
          size="sm"
          onClick={onRestore}
          className="h-8 px-3 text-xs font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
        >
          Khôi phục bản nháp
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDiscard}
          className="h-8 px-2.5 text-xs cursor-pointer text-muted-foreground hover:text-destructive"
        >
          Bỏ qua
        </Button>
      </div>
    </div>
  );
}
