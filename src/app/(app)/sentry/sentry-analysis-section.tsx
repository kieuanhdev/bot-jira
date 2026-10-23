"use client";

import { AlertTriangle, FileCode2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/api-client";
import { confidenceLabel, type AnalysisConfidence } from "@/lib/sentry/analysis";
import { useSentryAnalysis } from "./use-sentry-analysis";

const CONFIDENCE_VARIANT: Record<AnalysisConfidence, "success" | "warning" | "secondary"> = {
  high: "success",
  medium: "warning",
  low: "secondary",
};

/** Beyond this the job has probably not reached a runner. */
const SLOW_QUEUE_MS = 60_000;

export function SentryAnalysisSection({ rowId, open }: { rowId: string; open: boolean }) {
  const { query, request } = useSentryAnalysis(rowId, { enabled: open, autoRequest: true });
  const data = query.data;
  const busy = request.isPending;
  const waiting = data?.state === "pending" || data?.state === "running";
  const slowQueue =
    data?.state === "pending" && data.requestedAt !== null && Date.now() - new Date(data.requestedAt).getTime() > SLOW_QUEUE_MS;

  return (
    <section className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Nguyên nhân &amp; hướng sửa
        </h3>
        {data && (data.state === "done" || data.state === "failed") && (
          <Button variant="ghost" size="sm" className="cursor-pointer" disabled={busy} onClick={() => request.mutate(true)}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Phân tích lại
          </Button>
        )}
      </div>

      {query.isLoading || (data?.state === "none" && busy) ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : query.isError || request.isError ? (
        <p role="alert" className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {getErrorMessage(query.error ?? request.error)}
        </p>
      ) : waiting ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3" aria-busy="true">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {data?.state === "running" ? "Đang đọc code và phân tích lỗi…" : "Đang chờ runner nhận việc…"}
          </p>
          {slowQueue && (
            <p className="text-xs text-muted-foreground">
              Chờ hơi lâu: kiểm tra runner (scripts/sentry-runner.mjs) có đang chạy trên máy chủ không.
            </p>
          )}
        </div>
      ) : data?.state === "failed" ? (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {data.error ?? "Phân tích không thành công."}
        </p>
      ) : data?.result ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={CONFIDENCE_VARIANT[data.result.confidence]}>Độ tin cậy {confidenceLabel(data.result.confidence)}</Badge>
            {data.result.autoFixable !== undefined && (
              <Badge variant={data.result.autoFixable ? "info" : "neutral"}>
                {data.result.autoFixable ? "Có thể sửa bằng code" : "Cần xử lý thủ công"}
              </Badge>
            )}
            {data.gitRef && <Badge variant="secondary">{data.gitRef}</Badge>}
          </div>
          {data.result.flow && (
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold text-muted-foreground">Luồng dẫn đến lỗi</h4>
              <p className="whitespace-pre-wrap break-words text-foreground">{data.result.flow}</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold text-muted-foreground">Nguyên nhân</h4>
            <p className="whitespace-pre-wrap break-words text-foreground">{data.result.rootCause}</p>
          </div>
          {data.result.reproSteps && data.result.reproSteps.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold text-muted-foreground">Các bước tái hiện (dự đoán từ code)</h4>
              <ol className="list-decimal pl-5 text-foreground">
                {data.result.reproSteps.map((step, i) => (
                  <li key={i} className="break-words">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {data.result.files.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className="text-xs font-semibold text-muted-foreground">File liên quan</h4>
              <ul className="flex flex-col gap-1 font-mono text-xs text-foreground">
                {data.result.files.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 break-all">
                    <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold text-muted-foreground">Hướng sửa</h4>
            <p className="whitespace-pre-wrap break-words text-foreground">{data.result.suggestedFix}</p>
          </div>
          {data.result.patch && (
            <details className="flex flex-col gap-1 rounded-md border border-border bg-card p-2">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                Bản vá đề xuất (chưa biên dịch/chạy thử)
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre font-mono text-xs text-foreground">{data.result.patch}</pre>
            </details>
          )}
          <p className="text-2xs text-muted-foreground">
            AI đọc code theo phiên bản của lỗi; cần dev kiểm tra lại trước khi sửa. Nội dung này sẽ được đưa vào mô tả task khi tạo task.
          </p>
        </div>
      ) : null}
    </section>
  );
}
