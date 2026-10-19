"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { bulkKeys, issuesKeys, staleKeys } from "@/lib/query-keys";
import type { OpListItem, Preview } from "./bulk-types";
import type { SelectionMode } from "./bulk-logic";

export interface UseBulkOperationsOptions {
  preview: Preview | null;
  selectionMode: SelectionMode;
  onClearSelected: () => void;
  setPreviewError: (error: string | null) => void;
  onOperationConfirmed?: (operationId: string) => void;
  /** Operation to show on load, e.g. from a notification's `/bulk?operation=<id>` link. */
  initialActiveOp?: string | null;
}

export function useBulkOperations({
  preview,
  selectionMode,
  onClearSelected,
  setPreviewError,
  onOperationConfirmed,
  initialActiveOp,
}: UseBulkOperationsOptions) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(initialActiveOp || null);

  // Operations history managed via TanStack Query
  const { data: opsData, isSuccess, refetch } = useQuery({
    queryKey: bulkKeys.operations,
    queryFn: () => api<{ items: OpListItem[] }>("/api/bulk/operations?limit=20"),
    staleTime: 30_000,
  });

  const ops = opsData?.items ?? [];
  const opsLoaded = isSuccess || ops.length > 0;

  const loadOps = useCallback(() => {
    refetch();
  }, [refetch]);

  async function doConfirm() {
    if (!preview) return;
    setConfirming(true);
    try {
      const r = await api<{ operationId: string; queued: boolean }>("/api/issues/bulk", {
        method: "POST",
        body: {
          confirm: true,
          operationId: preview.operationId,
        },
      });
      if (selectionMode === "pick") onClearSelected();
      setActiveOp(r.operationId);
      onOperationConfirmed?.(r.operationId);
      qc.invalidateQueries({ queryKey: issuesKeys.all });
      qc.invalidateQueries({ queryKey: staleKeys.all });
      qc.invalidateQueries({ queryKey: bulkKeys.operations });
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function doRetry(id: string) {
    try {
      await api(`/api/bulk/operations/${id}/retry`, { method: "POST" });
      setActiveOp(id);
      qc.invalidateQueries({ queryKey: bulkKeys.operations });
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }

  return {
    confirming,
    confirmOpen,
    setConfirmOpen,
    activeOp,
    setActiveOp,
    ops,
    opsLoaded,
    loadOps,
    doConfirm,
    doRetry,
  };
}
export type BulkOperationsController = ReturnType<typeof useBulkOperations>;
