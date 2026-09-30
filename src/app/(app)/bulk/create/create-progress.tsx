"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  PlusCircle,
} from "lucide-react";

interface OperationDetailResponse {
  operation: {
    id: string;
    type: string;
    state: "preview" | "queued" | "running" | "completed" | "partially_failed" | "failed" | "cancelled";
    total: number;
    succeeded: number;
    failed: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    payload: { projectKey?: string };
    createItems?: Array<{
      id: string;
      rowIndex: number;
      clientRef: string;
      jiraKey: string | null;
      status: string;
      error: string | null;
      errorCode: string | null;
      retryable: boolean;
      attemptCount: number;
      requested: { summary?: string; issueTypeId?: string };
    }>;
  };
}

interface CreateProgressProps {
  operationId: string;
  onReset: () => void;
}

export function CreateProgress({ operationId, onReset }: CreateProgressProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [selectedRetryIds, setSelectedRetryIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["bulk-operation", operationId],
    queryFn: () => api<OperationDetailResponse>(`/api/bulk/operations/${operationId}`),
    refetchInterval: (query) => {
      const state = query.state.data?.operation.state;
      if (state === "completed" || state === "partially_failed" || state === "failed" || state === "cancelled") {
        return false;
      }
      return 2000;
    },
  });

  const retryMutation = useMutation({
    mutationFn: (itemIds?: string[]) =>
      api<{ queued: boolean; operationId: string; retried: number }>(
        `/api/bulk/operations/${operationId}/retry`,
        {
          method: "POST",
          body: JSON.stringify(itemIds && itemIds.length > 0 ? { itemIds } : {}),
        }
      ),
    onSuccess: () => {
      setSelectedRetryIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["bulk-operation", operationId] });
      queryClient.invalidateQueries({ queryKey: ["bulk-operations"] });
    },
  });

  const op = data?.operation;
  const items = op?.createItems ?? [];
  const isFinished =
    op?.state === "completed" ||
    op?.state === "partially_failed" ||
    op?.state === "failed" ||
    op?.state === "cancelled";

  const total = op?.total ?? 1;
  const succeeded = op?.succeeded ?? 0;
  const failed = op?.failed ?? 0;
  const processed = succeeded + failed;
  const percent = Math.min(100, Math.round((processed / total) * 100));

  const allKeys = items
    .map((i) => i.jiraKey)
    .filter((k): k is string => Boolean(k));

  function handleCopyKeys() {
    if (allKeys.length === 0) return;
    navigator.clipboard.writeText(allKeys.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleRetryItem(id: string) {
    const next = new Set(selectedRetryIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRetryIds(next);
  }

  if (isLoading && !op) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress Status Banner */}
      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              {!isFinished ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                </div>
              ) : op?.state === "completed" ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                </div>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <XCircle className="h-5 w-5" aria-hidden="true" />
                </div>
              )}
              <div>
                <CardTitle className="text-base font-semibold">
                  {!isFinished
                    ? "Đang tiến hành tạo task trên Jira..."
                    : op?.state === "completed"
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
                  onClick={handleCopyKeys}
                  className="h-8 gap-1.5 text-xs cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
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
            {!isFinished && (
              <Badge variant="info" className="px-2.5 py-1 font-mono">
                Đang xử lý: {total - processed}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Items Details Table */}
      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Kết quả chi tiết từng dòng</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Nhấp vào mã Jira Key để mở trực tiếp trên Jira hoặc xem trong danh sách.
            </CardDescription>
          </div>

          {isFinished && failed > 0 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  retryMutation.mutate(
                    selectedRetryIds.size > 0 ? Array.from(selectedRetryIds) : undefined
                  )
                }
                disabled={retryMutation.isPending}
                className="h-8 gap-1.5 text-xs cursor-pointer text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {selectedRetryIds.size > 0
                  ? `Thử lại ${selectedRetryIds.size} dòng đã chọn`
                  : "Thử lại các dòng lỗi (Retry)"}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-y border-border bg-muted/20 font-semibold text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-2.5">#</th>
                  <th className="w-28 px-3 py-2.5">Trạng thái</th>
                  <th className="w-36 px-3 py-2.5">Jira Key</th>
                  <th className="min-w-[240px] px-3 py-2.5">Tiêu đề (Summary)</th>
                  <th className="min-w-[200px] px-3 py-2.5">Kết quả / Lỗi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {items.map((item) => {
                  const isSucceeded = item.status === "succeeded";
                  const isFailed = item.status === "failed";
                  const isRunning = item.status === "running";
                  const isPending = item.status === "pending";

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isFailed ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-muted/15"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {item.rowIndex + 1}
                      </td>

                      <td className="px-3 py-3">
                        {isSucceeded && (
                          <Badge variant="success" className="gap-1 font-medium">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Thành công
                          </Badge>
                        )}
                        {isFailed && (
                          <Badge variant="danger" className="gap-1 font-medium">
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            Thất bại
                          </Badge>
                        )}
                        {isRunning && (
                          <Badge variant="info" className="gap-1 font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            Đang tạo
                          </Badge>
                        )}
                        {isPending && (
                          <Badge variant="secondary" className="gap-1 font-medium">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            Chờ xử lý
                          </Badge>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {item.jiraKey ? (
                          <Link
                            href={`https://jira.example.com/browse/${item.jiraKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono font-semibold text-primary hover:underline"
                          >
                            {item.jiraKey}
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span className="font-mono text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">
                          {item.requested?.summary || item.clientRef}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        {isSucceeded && (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            Đã tạo thành công
                          </span>
                        )}
                        {isFailed && (
                          <div className="space-y-1">
                            <span className="text-red-700 dark:text-red-400">
                              {item.error || "Lỗi tạo task"}
                            </span>
                            {item.retryable && isFinished && (
                              <div>
                                <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                                  <input
                                    type="checkbox"
                                    checked={selectedRetryIds.has(item.id)}
                                    onChange={() => toggleRetryItem(item.id)}
                                    className="rounded border-border"
                                  />
                                  Chọn để thử lại
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                        {(isRunning || isPending) && (
                          <span className="text-muted-foreground">Đang trong hàng đợi</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
