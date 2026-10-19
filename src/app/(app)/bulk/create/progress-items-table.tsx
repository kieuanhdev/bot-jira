"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  RefreshCw,
  GitBranch,
} from "lucide-react";

export interface ProgressCreateItem {
  id: string;
  rowIndex: number;
  clientRef: string;
  jiraKey: string | null;
  status: string;
  error: string | null;
  errorCode: string | null;
  retryable: boolean;
  attemptCount: number;
  parentClientRef: string | null;
  requested: { summary?: string; issueTypeId?: string };
}

export interface ProgressItemRowProps {
  item: ProgressCreateItem;
  isFinished: boolean;
  isSelectedRetry: boolean;
  blockedChildCount: number;
  isRetryingBranch: boolean;
  onToggleRetry: (id: string) => void;
  onRetryBranch: (clientRef: string) => void;
}

export const ProgressItemRow = React.memo(function ProgressItemRow({
  item,
  isFinished,
  isSelectedRetry,
  blockedChildCount,
  isRetryingBranch,
  onToggleRetry,
  onRetryBranch,
}: ProgressItemRowProps) {
  const isSucceeded = item.status === "succeeded";
  const isFailed = item.status === "failed";
  const isRunning = item.status === "running";
  const isPending = item.status === "pending";
  const isWaitingForParent = item.status === "waiting_for_parent";
  const isBlockedByParent = item.status === "blocked_by_parent";

  return (
    <tr
      className={`transition-colors ${
        isFailed
          ? "bg-destructive/5 hover:bg-destructive/10"
          : isBlockedByParent
            ? "bg-warning/5 hover:bg-warning/10"
            : "hover:bg-muted/15"
      }`}
    >
      <td className="px-4 py-3 font-mono text-2xs text-muted-foreground">
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
        {isWaitingForParent && (
          <Badge variant="info" className="gap-1 font-medium">
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            Chờ parent
          </Badge>
        )}
        {isBlockedByParent && (
          <Badge variant="warning" className="gap-1 font-medium">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            Chặn (parent)
          </Badge>
        )}
      </td>

      <td className="px-3 py-3">
        {item.jiraKey ? (
          <Link
            href={`/issue/${item.jiraKey}`}
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
          <span className="text-success">
            Đã tạo thành công
          </span>
        )}
        {isFailed && (
          <div className="space-y-1">
            <span className="text-destructive">
              {item.error || "Lỗi tạo task"}
            </span>
            {(item.retryable || isFailed) && isFinished && (
              <div>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-2xs text-muted-foreground hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={isSelectedRetry}
                    onChange={() => onToggleRetry(item.id)}
                    className="rounded border-border"
                  />
                  Chọn để thử lại
                </label>
              </div>
            )}
            {blockedChildCount > 0 && isFinished && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRetryBranch(item.clientRef)}
                disabled={isRetryingBranch}
                className="mt-1 h-7 gap-1 px-2.5 text-2xs cursor-pointer text-primary border-primary/30 hover:bg-primary-soft"
              >
                {isRetryingBranch ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <GitBranch className="h-3 w-3" aria-hidden="true" />
                )}
                Thử lại cả nhánh ({blockedChildCount} con)
              </Button>
            )}
          </div>
        )}
        {(isRunning || isPending) && (
          <span className="text-muted-foreground">Đang trong hàng đợi</span>
        )}
        {isWaitingForParent && (
          <span className="text-muted-foreground">Đang chờ parent được tạo</span>
        )}
        {isBlockedByParent && (
          <span className="text-warning">{item.error || "Parent thất bại"}</span>
        )}
      </td>
    </tr>
  );
});

export interface ProgressItemsTableProps {
  items: ProgressCreateItem[];
  isFinished: boolean;
  failedCount: number;
  selectedRetryIds: Set<string>;
  blockedChildrenMap: Map<string, number>;
  isRetrying: boolean;
  retryError?: string | null;
  retryingBranchRef?: string | null;
  retryBranchError?: string | null;
  onRetry: () => void;
  onToggleRetry: (id: string) => void;
  onRetryBranch: (clientRef: string) => void;
}

export function ProgressItemsTable({
  items,
  isFinished,
  failedCount,
  selectedRetryIds,
  blockedChildrenMap,
  isRetrying,
  retryError,
  retryingBranchRef,
  retryBranchError,
  onRetry,
  onToggleRetry,
  onRetryBranch,
}: ProgressItemsTableProps) {
  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Kết quả chi tiết từng dòng</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Nhấp vào mã Jira Key để mở trực tiếp trên Jira hoặc xem trong danh sách.
          </CardDescription>
        </div>

        {isFinished && failedCount > 0 && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isRetrying}
              className="h-8 gap-1.5 text-xs cursor-pointer text-warning border-warning/30 hover:bg-warning/10"
            >
              {isRetrying ? (
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

      {retryError && (
        <div className="mx-6 mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          Lỗi khi thử lại: {retryError}
        </div>
      )}

      {retryBranchError && (
        <div className="mx-6 mb-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          Lỗi khi thử lại nhánh: {retryBranchError}
        </div>
      )}

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
              {items.map((item) => (
                <ProgressItemRow
                  key={item.id}
                  item={item}
                  isFinished={isFinished}
                  isSelectedRetry={selectedRetryIds.has(item.id)}
                  blockedChildCount={item.status === "failed" ? (blockedChildrenMap.get(item.clientRef) ?? 0) : 0}
                  isRetryingBranch={retryingBranchRef === item.clientRef}
                  onToggleRetry={onToggleRetry}
                  onRetryBranch={onRetryBranch}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
