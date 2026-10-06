"use client";

import { Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BulkCreateEmptyGuideProps {
  projectKey: string;
  onAddFiveRows: () => void;
}

export function BulkCreateEmptyGuide({
  projectKey,
  onAddFiveRows,
}: BulkCreateEmptyGuideProps) {
  return (
    <div className="m-4 rounded-xl border border-dashed border-border/80 bg-muted/15 p-6 text-center animate-in fade-in duration-200">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </div>
      <h4 className="text-sm font-semibold text-foreground">
        Bắt đầu soạn thảo danh sách task cho {projectKey}
      </h4>
      <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
        Bạn có thể gõ trực tiếp vào ô Tiêu đề, chọn ô rồi dán nhiều dòng từ Excel/Google Sheets (
        <kbd className="rounded border border-border px-1 py-0.2 font-mono text-[10px] bg-muted/40">
          Ctrl+V
        </kbd>
        ), hoặc thêm nhanh các dòng mẫu.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddFiveRows}
          className="h-8 text-xs gap-1.5 cursor-pointer bg-card hover:bg-muted border-border font-medium"
        >
          <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>Thêm nhanh 5 dòng trống</span>
        </Button>
      </div>
    </div>
  );
}
