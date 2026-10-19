"use client";

import { AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api, getErrorMessage } from "@/lib/api-client";

export type SentryAiSummaryResult = {
  summary: string;
  description: string;
  priorityName?: string;
  usedEvent: boolean;
};

/**
 * Calls `/api/sentry/[id]/ai-summary`. Keep it above the sheet
 * content (which unmounts on close) so a result survives closing the form.
 */
export function useSentryAiSummary(rowId: string) {
  return useMutation({
    mutationFn: () =>
      api<SentryAiSummaryResult>(`/api/sentry/${encodeURIComponent(rowId)}/ai-summary`, {
        method: "POST",
      }),
  });
}

export interface SentryAiSummaryButtonProps {
  pending: boolean;
  /** Disable running/applying, e.g. while the task is being created. */
  disabled?: boolean;
  error: unknown;
  /** Last successful result's `usedEvent`; null before any result. */
  usedEvent: boolean | null;
  /** A result waiting for the user to apply or dismiss it. */
  proposal: SentryAiSummaryResult | null;
  /** Whether applying the proposal also sets the priority (its name maps to a project priority). */
  proposalSetsPriority: boolean;
  /** Muted note from the last apply, e.g. an unmapped priority. */
  note: string | null;
  onRun(): void;
  onApply(): void;
  onDismiss(): void;
}

/** "AI tóm tắt lỗi" action for the Sentry task form header. Presentational only. */
export function SentryAiSummaryButton({
  pending,
  disabled = false,
  error,
  usedEvent,
  proposal,
  proposalSetsPriority,
  note,
  onRun,
  onApply,
  onDismiss,
}: SentryAiSummaryButtonProps) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 cursor-pointer gap-1.5 text-xs"
          onClick={onRun}
          disabled={pending || disabled}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {pending ? "Đang tóm tắt…" : "AI tóm tắt lỗi"}
        </Button>
        {usedEvent === false && !pending && (
          <span className="text-xs text-muted-foreground">
            Không lấy được stacktrace, tóm tắt từ thông tin cơ bản
          </span>
        )}
      </div>

      {note && !proposal && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {note}
        </p>
      )}

      {error != null && !pending && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {getErrorMessage(error, "AI không phản hồi, thử lại")}
        </p>
      )}

      {proposal && (
        <div
          role="status"
          className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-foreground"
        >
          <p className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              Thay tiêu đề, mô tả{proposalSetsPriority ? " và điền priority" : ""} bằng bản AI?
            </span>
          </p>
          <p className="line-clamp-2 font-medium">{proposal.summary}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 cursor-pointer text-xs" onClick={onDismiss}>
              Bỏ qua
            </Button>
            <Button type="button" size="sm" className="h-7 cursor-pointer text-xs" onClick={onApply} disabled={disabled}>
              Áp dụng
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
