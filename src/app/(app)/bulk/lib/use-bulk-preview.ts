"use client";

import { useCallback, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import type { IssueFilters } from "@/lib/issues/issue-filters";
import type { BulkAction, Preview, PreviewBucket } from "./bulk-types";
import { previewBucket } from "./bulk-utils";
import {
  buildPreviewRequestBody,
  computePreviewBasis,
  countPreviewBuckets,
  getConfirmLabel,
  type SelectionMode,
} from "./bulk-logic";

export interface UseBulkPreviewOptions {
  filterProject: string;
  selectionMode: SelectionMode;
  taskFilters: IssueFilters;
  selected: Set<string>;
  action: BulkAction | null;
  targetStatus: string;
  quickFilter?: string;
  onBeforePreview?: () => void;
}

export function useBulkPreview({
  filterProject,
  selectionMode,
  taskFilters,
  selected,
  action,
  targetStatus,
  quickFilter,
  onBeforePreview,
}: UseBulkPreviewOptions) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewView, setPreviewView] = useState<PreviewBucket>("changes");
  const [previewBasis, setPreviewBasis] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [prevFilterProject, setPrevFilterProject] = useState(filterProject);
  if (filterProject !== prevFilterProject) {
    setPrevFilterProject(filterProject);
    setPreview(null);
    setPreviewBasis(null);
  }

  const resetPreview = useCallback(() => {
    setPreview(null);
    setPreviewBasis(null);
  }, []);

  const currentBasis = useMemo(() => {
    return computePreviewBasis({
      action,
      selectionMode,
      filterProject,
      taskFilters,
      selected,
      quickFilter,
    });
  }, [selectionMode, filterProject, taskFilters, selected, action, quickFilter]);

  const previewOutdated = preview != null && previewBasis !== currentBasis;

  async function doPreview() {
    if (!action || !filterProject) return;
    if (selectionMode === "pick" && selected.size === 0) return;
    setPreviewing(true);
    setPreview(null);
    onBeforePreview?.();
    setPreviewError(null);
    try {
      const body = buildPreviewRequestBody({
        selectionMode,
        filterProject,
        taskFilters,
        selected,
        action,
        quickFilter,
      });
      const r = await api<Preview>("/api/issues/bulk", {
        method: "POST",
        body,
      });
      setPreview(r);
      setPreviewBasis(currentBasis);
      setPreviewView("changes");
    } catch (e) {
      setPreview(null);
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function doCancelPreview() {
    if (!preview) return;
    try {
      await api(`/api/bulk/operations/${preview.operationId}/cancel`, { method: "POST" });
    } catch {
      /* ignore */
    }
    resetPreview();
  }

  const previewCounts = countPreviewBuckets(preview);
  const visiblePreviewItems = preview?.items.filter((item) => previewBucket(item) === previewView) ?? [];
  const isLogWorkOp = action?.kind === "log-work" || preview?.type === "log-work";
  const isTransitionOp = action?.kind === "transition" || preview?.type === "transition";
  const confirmLabel = getConfirmLabel({ preview, isLogWorkOp, isTransitionOp, targetStatus });

  return {
    preview,
    setPreview,
    previewing,
    previewView,
    setPreviewView,
    previewBasis,
    currentBasis,
    previewError,
    setPreviewError,
    previewOutdated,
    doPreview,
    doCancelPreview,
    resetPreview,
    previewCounts,
    visiblePreviewItems,
    isLogWorkOp,
    isTransitionOp,
    confirmLabel,
  };
}
export type BulkPreviewController = ReturnType<typeof useBulkPreview>;
