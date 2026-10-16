"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { bulkKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { exportOperationCsv } from "./lib/export-operation-csv";
import { ProgressStatusBanner } from "./progress-status-banner";
import { ProgressItemsTable, type ProgressCreateItem } from "./progress-items-table";

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
    createItems?: ProgressCreateItem[];
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
    queryKey: bulkKeys.operation(operationId),
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
          body: itemIds && itemIds.length > 0 ? { itemIds } : {},
        }
      ),
    onSuccess: () => {
      setSelectedRetryIds(new Set());
      queryClient.invalidateQueries({ queryKey: bulkKeys.operation(operationId) });
      queryClient.invalidateQueries({ queryKey: bulkKeys.operations });
    },
  });

  const retryBranchMutation = useMutation({
    mutationFn: (clientRef: string) =>
      api<{ queued: boolean; operationId: string; retriedParent: string; unblockedChildren: number }>(
        `/api/bulk/operations/${operationId}/retry-branch`,
        { method: "POST", body: { clientRef } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bulkKeys.operation(operationId) });
      queryClient.invalidateQueries({ queryKey: bulkKeys.operations });
    },
  });

  const op = data?.operation;
  const items = useMemo(() => op?.createItems ?? [], [op?.createItems]);
  const isFinished =
    op?.state === "completed" ||
    op?.state === "partially_failed" ||
    op?.state === "failed" ||
    op?.state === "cancelled";

  const blockedCount = useMemo(
    () => items.filter((i) => i.status === "blocked_by_parent").length,
    [items]
  );

  const blockedChildrenMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.status === "blocked_by_parent" && item.parentClientRef) {
        map.set(
          item.parentClientRef,
          (map.get(item.parentClientRef) ?? 0) + 1
        );
      }
    }
    return map;
  }, [items]);

  const total = op?.total ?? 1;
  const succeeded = op?.succeeded ?? 0;
  const failed = op?.failed ?? 0;
  const processed = succeeded + failed;
  const percent = Math.min(100, Math.round((processed / total) * 100));

  const allKeys = useMemo(
    () => items.map((i) => i.jiraKey).filter((k): k is string => Boolean(k)),
    [items]
  );

  const handleCopyKeys = useCallback(() => {
    if (allKeys.length === 0) return;
    navigator.clipboard.writeText(allKeys.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [allKeys]);

  const handleExportCsv = useCallback(() => {
    if (!items || items.length === 0) return;
    const projectKey = op?.payload?.projectKey || "";
    exportOperationCsv(items, { projectKey, operationId });
  }, [items, op?.payload?.projectKey, operationId]);

  const toggleRetryItem = useCallback((id: string) => {
    setSelectedRetryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRetry = useCallback(() => {
    retryMutation.mutate(
      selectedRetryIds.size > 0 ? Array.from(selectedRetryIds) : undefined
    );
  }, [retryMutation, selectedRetryIds]);

  const handleRetryBranch = useCallback(
    (clientRef: string) => {
      retryBranchMutation.mutate(clientRef);
    },
    [retryBranchMutation]
  );

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
      <ProgressStatusBanner
        operationId={operationId}
        isFinished={isFinished}
        state={op?.state}
        total={total}
        succeeded={succeeded}
        failed={failed}
        blockedCount={blockedCount}
        processed={processed}
        percent={percent}
        allKeys={allKeys}
        copied={copied}
        itemsCount={items.length}
        onCopyKeys={handleCopyKeys}
        onExportCsv={handleExportCsv}
        onReset={onReset}
      />

      <ProgressItemsTable
        items={items}
        isFinished={isFinished}
        failedCount={failed}
        selectedRetryIds={selectedRetryIds}
        blockedChildrenMap={blockedChildrenMap}
        isRetrying={retryMutation.isPending}
        retryError={retryMutation.isError ? retryMutation.error.message : null}
        retryingBranchRef={retryBranchMutation.isPending ? retryBranchMutation.variables : null}
        retryBranchError={retryBranchMutation.isError ? retryBranchMutation.error.message : null}
        onRetry={handleRetry}
        onToggleRetry={toggleRetryItem}
        onRetryBranch={handleRetryBranch}
      />
    </div>
  );
}
