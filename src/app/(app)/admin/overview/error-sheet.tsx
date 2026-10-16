"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, AlertCircle, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { timeAgo, cn } from "@/lib/utils";

type SentryFailedItem = {
  id: string;
  sentryProject: string;
  sentryIssueId: string;
  jiraKey: string | null;
  state: string;
  attemptCount: number;
  lastError: string | null;
  lastAttemptAt: string | null;
};

type OutboxFailedItem = {
  id: string;
  channel: string;
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  title: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 cursor-pointer p-0 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      title="Sao chép lỗi"
      aria-label="Sao chép lỗi"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}

export function ErrorSheet({
  type,
  open,
  onOpenChange,
}: {
  type: "sentry" | "outbox";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = React.useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);

  const queryKey = React.useMemo(
    () => [...adminKeys.overview, "errors", type],
    [type]
  );

  const sentryQuery = useQuery({
    queryKey,
    queryFn: () => api<{ items: SentryFailedItem[] }>("/api/admin/sentry-import?state=failed"),
    enabled: open && type === "sentry",
  });

  const outboxQuery = useQuery({
    queryKey,
    queryFn: () => api<{ items: OutboxFailedItem[] }>("/api/admin/outbox?state=failed"),
    enabled: open && type === "outbox",
  });

  const query = type === "sentry" ? sentryQuery : outboxQuery;

  const retrySingle = useMutation({
    mutationFn: async (id: string) => {
      setRetryingId(id);
      if (type === "sentry") {
        return api("/api/admin/sentry-import", {
          method: "POST",
          body: { id },
        });
      }
      return api("/api/admin/outbox/retry", {
        method: "POST",
        body: { ids: [id] },
      });
    },
    onSuccess: () => {
      setActionFeedback("Đã xếp hàng thử lại thành công.");
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      setTimeout(() => setActionFeedback(null), 3500);
    },
    onSettled: () => {
      setRetryingId(null);
    },
  });

  const retryAll = useMutation({
    mutationFn: async () => {
      if (type === "sentry") {
        const items = sentryQuery.data?.items ?? [];
        for (const item of items) {
          await api("/api/admin/sentry-import", {
            method: "POST",
            body: { id: item.id },
          });
        }
        return { count: items.length };
      }
      return api<{ count: number }>("/api/admin/outbox/retry", {
        method: "POST",
        body: {},
      });
    },
    onSuccess: (data) => {
      setActionFeedback(`Đã xếp hàng thử lại ${data?.count ?? "tất cả"} bản ghi.`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: adminKeys.overview });
      setTimeout(() => setActionFeedback(null), 3500);
    },
  });

  const title = type === "sentry" ? "Chi tiết lỗi nhập Sentry" : "Chi tiết thông báo gửi lỗi";
  const description =
    type === "sentry"
      ? "Danh sách các sự kiện Sentry chưa tạo được Jira issue."
      : "Danh sách các thông báo gặp lỗi khi chuyển phát qua Push / Chat.";

  const isRetryingAll = retryAll.isPending;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {actionFeedback && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{actionFeedback}</span>
          </div>
        )}

        {query.isLoading ? (
          <ListSkeleton rows={4} />
        ) : query.error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{getErrorMessage(query.error)}</span>
          </div>
        ) : (
          <>
            {type === "sentry" ? (
              (() => {
                const items = sentryQuery.data?.items ?? [];
                if (items.length === 0) {
                  return (
                    <EmptyState
                      icon={Check}
                      title="Không có lỗi nhập Sentry"
                      hint="Tất cả các issue Sentry đã được xử lý hoặc bỏ qua."
                    />
                  );
                }
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs text-muted-foreground">
                        {items.length} bản ghi lỗi
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRetryingAll}
                        onClick={() => retryAll.mutate()}
                        className="cursor-pointer gap-1.5 text-xs"
                      >
                        <RotateCcw
                          className={cn("h-3.5 w-3.5", isRetryingAll && "animate-spin")}
                          aria-hidden="true"
                        />
                        Thử lại tất cả
                      </Button>
                    </div>

                    <div className="flex flex-col divide-y divide-border">
                      {items.map((item) => {
                        const isRetrying = retryingId === item.id;
                        const maskedErr = maskSecrets(item.lastError);
                        return (
                          <div key={item.id} className="flex flex-col gap-1.5 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col">
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {item.sentryProject} #{item.sentryIssueId}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {item.attemptCount} lần thử · {item.lastAttemptAt ? timeAgo(item.lastAttemptAt) : "chưa thử"}
                                </span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isRetrying || isRetryingAll}
                                onClick={() => retrySingle.mutate(item.id)}
                                className="h-7 cursor-pointer gap-1 px-2 text-xs"
                              >
                                <RefreshCw
                                  className={cn("h-3 w-3", isRetrying && "animate-spin")}
                                  aria-hidden="true"
                                />
                                Thử lại
                              </Button>
                            </div>

                            {maskedErr && (
                              <div className="relative mt-1">
                                <pre className="max-h-32 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 pr-7 font-mono text-[11px] text-destructive">
                                  {maskedErr}
                                </pre>
                                <div className="absolute top-1 right-1">
                                  <CopyButton text={maskedErr} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            ) : (
              (() => {
                const items = outboxQuery.data?.items ?? [];
                if (items.length === 0) {
                  return (
                    <EmptyState
                      icon={Check}
                      title="Không có thông báo lỗi"
                      hint="Hàng đợi thông báo đang hoạt động ổn định."
                    />
                  );
                }
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs text-muted-foreground">
                        {items.length} thông báo lỗi
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRetryingAll}
                        onClick={() => retryAll.mutate()}
                        className="cursor-pointer gap-1.5 text-xs"
                      >
                        <RotateCcw
                          className={cn("h-3.5 w-3.5", isRetryingAll && "animate-spin")}
                          aria-hidden="true"
                        />
                        Thử lại tất cả
                      </Button>
                    </div>

                    <div className="flex flex-col divide-y divide-border">
                      {items.map((item) => {
                        const isRetrying = retryingId === item.id;
                        const maskedErr = maskSecrets(item.lastError);
                        return (
                          <div key={item.id} className="flex flex-col gap-1.5 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                                    {item.channel}
                                  </Badge>
                                  <span className="line-clamp-1 text-xs font-medium text-foreground">
                                    {item.title}
                                  </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground">
                                  {item.userEmail} · {item.attemptCount} lần thử · {timeAgo(item.updatedAt)}
                                </span>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isRetrying || isRetryingAll}
                                onClick={() => retrySingle.mutate(item.id)}
                                className="h-7 cursor-pointer gap-1 px-2 text-xs"
                              >
                                <RefreshCw
                                  className={cn("h-3 w-3", isRetrying && "animate-spin")}
                                  aria-hidden="true"
                                />
                                Thử lại
                              </Button>
                            </div>

                            {maskedErr && (
                              <div className="relative mt-1">
                                <pre className="max-h-32 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 pr-7 font-mono text-[11px] text-destructive">
                                  {maskedErr}
                                </pre>
                                <div className="absolute top-1 right-1">
                                  <CopyButton text={maskedErr} />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
