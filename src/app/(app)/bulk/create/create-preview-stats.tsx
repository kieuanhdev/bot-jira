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

        <Card className="border-emerald-500/20 bg-emerald-500/5 p-4 dark:border-emerald-500/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Sẵn sàng tạo
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            {preview.actionable}
          </div>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 p-4 dark:border-amber-500/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Có cảnh báo
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
            {warningCount}
          </div>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5 p-4 dark:border-red-500/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Bị chặn (Lỗi)
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-red-700 dark:text-red-400">
            {preview.blocked}
          </div>
        </Card>
      </div>

      {/* Slow operation latency alert banner */}
      {preview.metrics?.isSlow && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>
            Thời gian tạo bản xem trước kéo dài ({preview.metrics.durationMs}ms). Hoạt động mạng hoặc batch lớn có thể làm chậm quá trình xử lý.
          </span>
        </div>
      )}
    </div>
  );
}
