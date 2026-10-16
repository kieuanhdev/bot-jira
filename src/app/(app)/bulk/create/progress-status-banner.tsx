"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  PlusCircle,
  Download,
} from "lucide-react";

export interface ProgressStatusBannerProps {
  operationId: string;
  isFinished: boolean;
  state?: string;
  total: number;
  succeeded: number;
  failed: number;
  blockedCount: number;
  processed: number;
  percent: number;
  allKeys: string[];
  copied: boolean;
  itemsCount: number;
  onCopyKeys: () => void;
  onExportCsv: () => void;
  onReset: () => void;
}

export function ProgressStatusBanner({
  operationId,
  isFinished,
  state,
  total,
  succeeded,
  failed,
  blockedCount,
  processed,
  percent,
  allKeys,
  copied,
  itemsCount,
  onCopyKeys,
  onExportCsv,
  onReset,
}: ProgressStatusBannerProps) {
  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            {!isFinished ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
            ) : state === "completed" ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/10 text-warning">
                <XCircle className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            <div>
              <CardTitle className="text-base font-semibold">
                {!isFinished
                  ? "Đang tiến hành tạo task trên Jira..."
                  : state === "completed"
                    ? "Tất cả các task đã được tạo thành công!"
                    : "Thao tác đã hoàn thành với một số lỗi"}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Mã thao tác: <span className="font-mono">{operationId}</span>
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allKeys.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCopyKeys}
                className="h-8 gap-1.5 text-xs cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                    Đã sao chép
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Sao chép {allKeys.length} Jira keys
                  </>
                )}
              </Button>
            )}

            {itemsCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onExportCsv}
                className="h-8 gap-1.5 text-xs cursor-pointer text-foreground"
                title="Tải xuống toàn bộ kết quả tạo task ra file CSV"
              >
                <Download className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>Xuất CSV ({itemsCount})</span>
              </Button>
            )}

            {isFinished && (
              <Button
                type="button"
                size="sm"
                onClick={onReset}
                className="h-8 gap-1.5 text-xs cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Tạo batch mới
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="font-medium text-foreground">
              Tiến độ: {processed} / {total} task ({percent}%)
            </span>
            <span className="font-mono text-muted-foreground">
              {succeeded} thành công · {failed} lỗi
            </span>
          </div>
          <Progress value={percent} className="h-2.5" />
        </div>

        {/* Quick Counter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <Badge variant="outline" className="px-2.5 py-1 font-mono">
            Tổng: {total}
          </Badge>
          <Badge variant="success" className="px-2.5 py-1 font-mono">
            Thành công: {succeeded}
          </Badge>
          {failed > 0 && (
            <Badge variant="danger" className="px-2.5 py-1 font-mono">
              Lỗi: {failed}
            </Badge>
          )}
          {blockedCount > 0 && (
            <Badge variant="secondary" className="px-2.5 py-1 font-mono">
              Chờ parent: {blockedCount}
            </Badge>
          )}
          {!isFinished && (
            <Badge variant="info" className="px-2.5 py-1 font-mono">
              Đang xử lý: {total - processed}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
