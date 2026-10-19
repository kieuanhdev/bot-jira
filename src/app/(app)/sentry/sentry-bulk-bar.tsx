"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SentryBulkBarProps {
  selectedCount: number;
  showReject: boolean;
  busy: boolean;
  onCreate: () => void;
  onReject: () => void;
}

export function SentryBulkBar({
  selectedCount,
  showReject,
  busy,
  onCreate,
  onReject,
}: SentryBulkBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 shadow-sm">
      <span className="text-sm font-semibold text-foreground">
        Đã chọn {selectedCount} issue
      </span>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="cursor-pointer gap-1.5"
          disabled={busy}
          onClick={onCreate}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Tạo task cho {selectedCount} issue
        </Button>
        {showReject && (
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={busy}
            onClick={onReject}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Bỏ qua
          </Button>
        )}
      </div>
    </div>
  );
}
