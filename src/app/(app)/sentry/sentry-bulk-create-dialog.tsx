"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, Sparkles } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api, getErrorMessage } from "@/lib/api-client";
import type { SentryRowItem } from "./sentry-row";

interface BulkPreviewResponse {
  operationId: string;
  /** How many of the tasks carry a root-cause analysis in their description. */
  analysisIncluded?: number;
  total: number;
  actionable: number;
  blocked: number;
  items: Array<{
    clientRef?: string;
    summary: string;
    issueType?: string;
    labels?: string[];
    assignee?: string;
    status: "ok" | "blocked" | "warning";
    errors?: string[];
  }>;
}

interface BulkConfirmResponse {
  operationId: string;
  total: number;
  actionable: number;
  blocked: number;
  queued: boolean;
}

export interface SentryBulkCreateDialogProps {
  rows: SentryRowItem[] | null;
  onCancel: () => void;
  onSuccess: (data: { total: number; operationId: string }) => void;
}

export function SentryBulkCreateDialog({
  rows,
  onCancel,
  onSuccess,
}: SentryBulkCreateDialogProps) {
  const safeRows = useMemo(() => rows ?? [], [rows]);
  const targetProjects = useMemo(
    () => [...new Set(safeRows.map((r) => r.targetProject).filter(Boolean))],
    [safeRows]
  );
  const hasUnmapped = safeRows.some((r) => !r.targetProject);
  const multipleProjects = targetProjects.length > 1;

  const preview = useMutation({
    mutationFn: () =>
      api<BulkPreviewResponse>("/api/sentry/bulk-create", {
        method: "POST",
        body: { ids: safeRows.map((r) => r.id) },
      }),
  });

  const confirm = useMutation({
    mutationFn: (operationId: string) =>
      api<BulkConfirmResponse>("/api/sentry/bulk-create", {
        method: "POST",
        body: { confirm: true, operationId },
      }),
    onSuccess: (data) => {
      onSuccess({ total: data.total, operationId: data.operationId });
    },
  });

  // Automatically start preview when dialog opens with valid rows
  useEffect(() => {
    if (safeRows.length > 0 && !hasUnmapped && !multipleProjects) {
      preview.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeRows.length, hasUnmapped, multipleProjects]);

  if (!rows || rows.length === 0) return null;

  const previewData = preview.data;
  const isPreviewLoading = preview.isPending;
  const isConfirmLoading = confirm.isPending;
  const previewError = preview.error ? getErrorMessage(preview.error) : null;
  const confirmError = confirm.error ? getErrorMessage(confirm.error) : null;
  const errorMessage = previewError || confirmError;

  const isCredentialsRequired =
    errorMessage?.toLowerCase().includes("token jira") ||
    errorMessage?.toLowerCase().includes("settings");

  // Validation blockers
  if (hasUnmapped || multipleProjects) {
    return (
      <ConfirmDialog
        open
        onOpenChange={(next) => {
          if (!next) onCancel();
        }}
        icon={AlertCircle}
        title="Không thể tạo hàng loạt"
        tone="destructive"
        confirmLabel="Đóng"
        cancelLabel="Hủy"
        onConfirm={onCancel}
        className="sm:max-w-md"
      >
        <div className="py-2 text-xs text-muted-foreground">
          {hasUnmapped ? (
            <p>
              Có issue chưa được map sang dự án Jira. Chỉ có thể tạo task hàng loạt cho các issue
              đã có dự án Jira tương ứng.
            </p>
          ) : (
            <p>
              Các issue được chọn thuộc nhiều dự án Jira khác nhau ({targetProjects.join(", ")}).
              Vui lòng lọc theo từng dự án trước khi tạo task hàng loạt.
            </p>
          )}
        </div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next && !isConfirmLoading) onCancel();
      }}
      icon={CheckCircle2}
      title={`Tạo ${rows.length} task Jira?`}
      description="Task sẽ được tạo trên Jira bằng tài khoản cá nhân của bạn. Không gán assignee mặc định."
      confirmLabel={
        isConfirmLoading ? "Đang xử lý…" : `Tạo ${previewData?.actionable ?? rows.length} task`
      }
      cancelLabel="Hủy"
      pending={isConfirmLoading}
      disabled={isPreviewLoading || !previewData || previewData.actionable === 0}
      onConfirm={() => {
        if (previewData?.operationId) {
          confirm.mutate(previewData.operationId);
        }
      }}
      className="sm:max-w-xl"
    >
      <div className="flex flex-col gap-3 py-1">
        {isPreviewLoading && (
          <div className="space-y-2 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Đang kiểm tra dữ liệu và quyền trên Jira…</span>
            </div>
            {Array.from({ length: Math.min(rows.length, 3) }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <span>{errorMessage}</span>
              {isCredentialsRequired && (
                <Link
                  href="/settings"
                  className="font-semibold underline underline-offset-2 hover:text-destructive/80"
                >
                  Đến trang Cài đặt để cập nhật token Jira →
                </Link>
              )}
            </div>
          </div>
        )}

        {previewData && (
          <>
            {previewData.blocked > 0 && (
              <FeedbackBanner tone="warning">
                Có {previewData.blocked} task không hợp lệ hoặc bị chặn và sẽ không được tạo.
              </FeedbackBanner>
            )}

            <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto pr-1">
              {previewData.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-1 rounded-md border bg-muted/20 p-2.5 text-xs transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground line-clamp-1">
                      {item.summary}
                    </span>
                    <Badge variant={item.status === "blocked" ? "danger" : "secondary"} className="shrink-0 text-2xs">
                      {item.issueType || "Bug"}
                    </Badge>
                  </div>
                  {item.errors && item.errors.length > 0 && (
                    <p className="text-2xs text-destructive">{item.errors.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Dự án: <strong className="text-foreground">{targetProjects[0]}</strong> · Tạo {previewData.actionable} task.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {previewData.analysisIncluded
                ? `${previewData.analysisIncluded}/${previewData.total} task kèm phân tích nguyên nhân & hướng sửa.`
                : "Chưa task nào có phân tích. Mở chi tiết từng lỗi để AI phân tích trước khi tạo."}
            </p>
          </>
        )}
      </div>
    </ConfirmDialog>
  );
}
