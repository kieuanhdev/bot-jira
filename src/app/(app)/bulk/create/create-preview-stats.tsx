"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { BulkCreatePreviewResult } from "@/lib/bulk/create-types";

export interface CreatePreviewStatsProps {
  preview: BulkCreatePreviewResult;
  warningCount: number;
}

export function CreatePreviewStats({ preview, warningCount }: CreatePreviewStatsProps) {
  return (
    <div className="space-y-4">
      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/70 bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Tổng số task</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {preview.total}
          </div>
        </Card>

        <Card className="border-success/20 bg-success/5 p-4 dark:border-success/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Sẵn sàng tạo
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-success">
            {preview.actionable}
          </div>
        </Card>

        <Card className="border-warning/20 bg-warning/5 p-4 dark:border-warning/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Có cảnh báo
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-warning">
            {warningCount}
          </div>
        </Card>

        <Card className="border-destructive/20 bg-destructive/5 p-4 dark:border-destructive/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Bị chặn (Lỗi)
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-destructive">
            {preview.blocked}
          </div>
        </Card>
      </div>

      {/* Slow operation latency alert banner */}
      {preview.metrics?.isSlow && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            Thời gian tạo bản xem trước kéo dài ({preview.metrics.durationMs}ms). Hoạt động mạng hoặc batch lớn có thể làm chậm quá trình xử lý.
          </span>
        </div>
      )}
    </div>
  );
}
