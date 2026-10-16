"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { boardKeys } from "@/lib/query-keys";
import type { IssueItem } from "@/hooks/use-issues";
import type { SortMode } from "../lib/board-types";
import { sortIssues, columnKeyForIssue } from "../lib/board-utils";
import {
  COL_BATCH,
  buildColumns,
  buildColumnViews,
  indexColumnsByStatus,
  indexColumnsByStatusId,
  summarizeBoard,
  type BoardStatusesResponse,
} from "../lib/board-columns";
import { useColumnPreferences } from "../lib/board-hooks";
import { applyOptimisticStatus, useBoardOptimisticStatus } from "../lib/use-board-optimistic";

export interface UseBoardColumnsModelOptions {
  selectedProject: string;
  issues: IssueItem[];
  sortMode: SortMode;
  filterSig: string;
  activeFilterCount: number;
  boardQueriesEnabled: boolean;
}

export function useBoardColumnsModel({
  selectedProject,
  issues,
  sortMode,
  filterSig,
  activeFilterCount,
  boardQueriesEnabled,
}: UseBoardColumnsModelOptions) {
  const [colVisibleState, setColVisibleState] = useState<{ sig: string; counts: Record<string, number> }>({
    sig: "",
    counts: {},
  });

  const { data: statusesData, isLoading: isLoadingStatuses } = useQuery({
    queryKey: boardKeys.statuses(selectedProject),
    enabled: boardQueriesEnabled,
    queryFn: () =>
      api<BoardStatusesResponse>(`/api/board/statuses?project=${selectedProject}`),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const statusCategoryMap = useMemo<Record<string, string>>(
    () => statusesData?.statusCategoryMap ?? {},
    [statusesData?.statusCategoryMap]
  );

  const columns = useMemo(
    () => buildColumns(statusesData, statusCategoryMap, issues),
    [statusesData, statusCategoryMap, issues]
  );

  const { optimistic, setOptimisticStatus } = useBoardOptimisticStatus();

  const columnKeyByStatusId = useMemo(() => indexColumnsByStatusId(columns), [columns]);
  const columnKeyByStatus = useMemo(() => indexColumnsByStatus(columns), [columns]);

  const findColumnForIssue = useCallback(
    (issue: IssueItem): string => {
      const effective = applyOptimisticStatus(issue, optimistic);
      return columnKeyForIssue(
        effective,
        columnKeyByStatus,
        statusCategoryMap,
        columns,
        columnKeyByStatusId
      );
    },
    [optimistic, columnKeyByStatus, statusCategoryMap, columns, columnKeyByStatusId]
  );

  const byColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const c of columns) m.set(c.key, []);
    for (const issue of issues) {
      const col = findColumnForIssue(issue);
      const bucket = m.get(col);
      if (bucket) bucket.push(issue);
    }
    return m;
  }, [columns, issues, findColumnForIssue]);

  const sortedByColumn = useMemo(() => {
    const m = new Map<string, IssueItem[]>();
    for (const [k, v] of byColumn) m.set(k, sortIssues(v, sortMode));
    return m;
  }, [byColumn, sortMode]);

  const summary = useMemo(
    () => summarizeBoard(columns, byColumn, issues),
    [columns, byColumn, issues]
  );

  const {
    hiddenCols,
    collapsedCols,
    visibleColumns,
    toggleCollapse,
    hideColumn,
    showColumn,
    showAllColumns,
    toggleColumnVisibility,
    hideEmptyColumns,
    collapseEmptyColumns,
    expandAllCollapsedColumns,
    resetColumnPreferences,
  } = useColumnPreferences(selectedProject, columns, byColumn);

  const columnKeys = useMemo(() => visibleColumns.map((c) => c.key), [visibleColumns]);

  const colResetSig = useMemo(
    () => `${selectedProject}|${sortMode}|${filterSig}|${issues.length}`,
    [selectedProject, sortMode, filterSig, issues.length]
  );
  const colVisible = useMemo(
    () => (colVisibleState.sig === colResetSig ? colVisibleState.counts : {}),
    [colVisibleState, colResetSig]
  );

  const boardColumnsRender = useMemo(
    () => buildColumnViews(visibleColumns, sortedByColumn, colVisible, collapsedCols, activeFilterCount),
    [visibleColumns, sortedByColumn, colVisible, collapsedCols, activeFilterCount]
  );

  const growColumn = useCallback(
    (colId: string) => {
      setColVisibleState((prev) => {
        const counts = prev.sig === colResetSig ? { ...prev.counts } : {};
        counts[colId] = (counts[colId] ?? COL_BATCH) + COL_BATCH;
        return { sig: colResetSig, counts };
      });
    },
    [colResetSig]
  );

  return {
    statusesData,
    isLoadingStatuses,
    statusCategoryMap,
    columns,
    optimistic,
    setOptimisticStatus,
    findColumnForIssue,
    byColumn,
    sortedByColumn,
    summary,
    hiddenCols,
    collapsedCols,
    visibleColumns,
    columnKeys,
    toggleCollapse,
    hideColumn,
    showColumn,
    showAllColumns,
    toggleColumnVisibility,
    hideEmptyColumns,
    collapseEmptyColumns,
    expandAllCollapsedColumns,
    resetColumnPreferences,
    boardColumnsRender,
    growColumn,
  };
}
