"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { issuesKeys, staleKeys } from "@/lib/query-keys";
import type { OpListItem, Preview } from "./bulk-types";
import type { SelectionMode } from "./bulk-logic";

export interface UseBulkOperationsOptions {
  preview: Preview | null;
  selectionMode: SelectionMode;
  onClearSelected: () => void;
  setPreviewError: (error: string | null) => void;
  onOperationConfirmed?: (operationId: string) => void;
}

export function useBulkOperations({
  preview,
  selectionMode,
  onClearSelected,
  setPreviewError,
  onOperationConfirmed,
}: UseBulkOperationsOptions) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);

  // Operations history
  const [ops, setOps] = useState<OpListItem[]>([]);
  const [opsLoaded, setOpsLoaded] = useState(false);

  const loadOps = useCallback(() => {
    api<{ items: OpListItem[] }>("/api/bulk/operations?limit=20")
      .then((r) => setOps(r.items))
      .catch(() => null)
      .finally(() => setOpsLoaded(true));
  }, []);

  useEffect(() => {
    loadOps();
  }, [loadOps]);

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
      loadOps();
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
      loadOps();
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
