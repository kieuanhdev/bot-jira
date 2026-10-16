"use client";

import { useCallback, useMemo, useState } from "react";

export interface UseNotificationSelectionOptions {
  filteredIds: string[];
}

export interface UseNotificationSelectionReturn {
  selectedIds: Set<string>;
  selectedCount: number;
  isAllSelected: boolean;
  toggleSelectAll: () => void;
  toggleSelectOne: (id: string, e?: React.MouseEvent) => void;
  clearSelection: () => void;
  removeIds: (ids: string[]) => void;
}

export function useNotificationSelection({
  filteredIds,
}: UseNotificationSelectionOptions): UseNotificationSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter out any selected IDs that are no longer part of filteredIds (computed per render without effect)
  const validSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) return selectedIds;
    const validSet = new Set(filteredIds);
    let hasInvalid = false;
    for (const id of selectedIds) {
      if (!validSet.has(id)) {
        hasInvalid = true;
        break;
      }
    }
    if (!hasInvalid) return selectedIds;
    const pruned = new Set<string>();
    for (const id of selectedIds) {
      if (validSet.has(id)) pruned.add(id);
    }
    return pruned;
  }, [selectedIds, filteredIds]);

  const selectedCount = validSelectedIds.size;
  const isAllSelected =
    filteredIds.length > 0 && filteredIds.every((id) => validSelectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  }, [isAllSelected, filteredIds]);

  const toggleSelectOne = useCallback((id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const removeIds = useCallback((idsToRemove: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToRemove) {
        next.delete(id);
      }
      return next;
    });
  }, []);

  return {
    selectedIds: validSelectedIds,
    selectedCount,
    isAllSelected,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
    removeIds,
  };
}
