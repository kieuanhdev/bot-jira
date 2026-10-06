import type { IssueItem } from "@/hooks/use-issues";
import {
  canTransitionToStatus,
  findTransitionToStatus,
  transitionTarget,
} from "@/lib/jira/board-transitions";
import type { Transition } from "./board-types";
import { daysSince, statusDot } from "./board-utils";

/** Cards rendered per column before "grow" is requested. */
export const COL_BATCH = 40;
/** Columns in the "indeterminate" category above this many cards are flagged. */
export const WIP_LIMIT = 8;

export type BoardColumn = {
  key: string;
  label: string;
  category: string;
  isDone: boolean;
  isBacklog: boolean;
  statusIds: string[];
  statuses: Array<{ id: string; name: string }>;
};

/** Response of `/api/board/statuses`. */
export interface BoardStatusesResponse {
  projectKey?: string;
  source?: string;
  columns?: Array<{
    id: string;
    name: string;
    statusIds: string[];
    statuses: Array<{ id: string; name: string }>;
    category?: string;
    isBacklog: boolean;
    isDone: boolean;
  }>;
  backlogColumnId?: string | null;
  backlogStatusIds?: string[];
  items?: { name: string; category: string }[];
  statusCategoryMap: Record<string, string>;
}

/**
 * Workflow columns from the board config, plus a runtime column for any issue whose status
 * is not part of the workflow so it never gets lost or placed in the wrong column.
 */
export function buildColumns(
  statusesData: BoardStatusesResponse | undefined,
  statusCategoryMap: Record<string, string>,
  issues: IssueItem[]
): BoardColumn[] {
  const cols: BoardColumn[] = [];
  const seenColKeys = new Set<string>();
  const seenStatusNames = new Set<string>();

  if (statusesData?.columns && statusesData.columns.length > 0) {
    for (const c of statusesData.columns) {
      cols.push({
        key: c.id,
        label: c.name,
        category: c.isDone ? "done" : (statusCategoryMap[c.name] ?? "new"),
        isDone: c.isDone,
        isBacklog: c.isBacklog,
        statusIds: c.statusIds ?? [],
        statuses: c.statuses ?? [],
      });
      seenColKeys.add(c.id);
      seenStatusNames.add(c.name.toLowerCase());
      for (const s of c.statuses ?? []) {
        seenStatusNames.add(s.name.toLowerCase());
      }
    }
  }

  // Dynamic runtime column creation: if an issue has a status not present in workflow columns,
  // add a runtime column so it never gets lost or placed in the wrong column
  for (const issue of issues) {
    const sId = (issue.statusId || "").trim();
    const sName = (issue.status || "").trim();
    const key = sId ? `status:${sId}` : `status:${sName}`;
    if (!seenColKeys.has(key) && !seenStatusNames.has(sName.toLowerCase())) {
      seenColKeys.add(key);
      seenStatusNames.add(sName.toLowerCase());
      const cat = issue.statusCategory || statusCategoryMap[sName] || "new";
      cols.push({
        key,
        label: sName || (sId ? `Status ${sId}` : "Khác"),
        category: cat,
        isDone: cat === "done",
        isBacklog: false,
        statusIds: sId ? [sId] : [],
        statuses: sId ? [{ id: sId, name: sName }] : [],
      });
    }
  }

  if (cols.length === 0) {
    return [
      { key: "status:todo", label: "To Do", category: "new", isDone: false, isBacklog: false, statusIds: [], statuses: [] },
      { key: "status:inprogress", label: "In Progress", category: "indeterminate", isDone: false, isBacklog: false, statusIds: [], statuses: [] },
      { key: "status:done", label: "Done", category: "done", isDone: true, isBacklog: false, statusIds: [], statuses: [] },
    ];
  }

  return cols;
}

export function indexColumnsByStatusId(columns: BoardColumn[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of columns) {
    for (const sId of c.statusIds) {
      m.set(sId, c.key);
    }
  }
  return m;
}

export function indexColumnsByStatus(columns: BoardColumn[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of columns) {
    m.set(c.label, c.key);
    for (const s of c.statuses) {
      m.set(s.name, c.key);
    }
  }
  return m;
}

export function summarizeBoard(
  columns: BoardColumn[],
  byColumn: Map<string, IssueItem[]>,
  issues: IssueItem[]
) {
  let inProgress = 0;
  let done = 0;
  let stale = 0;
  for (const c of columns) {
    const items = byColumn.get(c.key) ?? [];
    if (c.category === "indeterminate") inProgress += items.length;
    if (c.category === "done") done += items.length;
    if (c.category !== "done") stale += items.filter((i) => daysSince(i.updatedAt) >= 7).length;
  }
  return { inProgress, stale, done, open: issues.length - done };
}

export function canDropTo(
  columns: BoardColumn[],
  statusCategoryMap: Record<string, string>,
  all: Transition[],
  targetLabel: string,
  targetCat: string | undefined,
  targetKey: string
): boolean {
  if (canTransitionToStatus(all, targetLabel)) {
    return true;
  }
  const targetCol = columns.find((c) => c.key === targetKey);
  if (targetCol && targetCol.statuses.length > 0) {
    for (const st of targetCol.statuses) {
      if (canTransitionToStatus(all, st.name)) return true;
    }
  }
  if (targetCat && targetKey !== targetLabel) {
    return all.some((tr) => {
      const t = transitionTarget(tr);
      return (statusCategoryMap[t] ?? statusCategoryMap[t.toLowerCase()]) === targetCat;
    });
  }
  return false;
}

export function findTransition(
  columns: BoardColumn[],
  statusCategoryMap: Record<string, string>,
  all: Transition[],
  targetLabel: string,
  targetKey?: string
): Transition | null {
  const exact = findTransitionToStatus(all, targetLabel);
  if (exact) return exact;
  if (targetKey) {
    const targetCol = columns.find((c) => c.key === targetKey);
    if (targetCol && targetCol.statuses.length > 0) {
      for (const st of targetCol.statuses) {
        const match = findTransitionToStatus(all, st.name);
        if (match) return match;
      }
    }
  }
  const targetCat = columns.find((c) => c.key === (targetKey ?? targetLabel))?.category;
  if (targetCat) {
    const byCat = all.find((tr) => {
      const target = transitionTarget(tr);
      const cat = statusCategoryMap[target] ?? statusCategoryMap[target.toLowerCase()];
      return cat === targetCat;
    });
    if (byCat) return byCat;
  }
  return null;
}

/** Keys of the columns an issue may be dragged to: its current column plus every column a transition leads to. */
export function allowedColumnKeys(
  columns: BoardColumn[],
  statusCategoryMap: Record<string, string>,
  currentCol: string,
  all: Transition[]
): Set<string> {
  return new Set(
    columns
      .filter(
        (c) =>
          c.key === currentCol || canDropTo(columns, statusCategoryMap, all, c.label, c.category, c.key)
      )
      .map((c) => c.key)
  );
}

export function buildColumnViews(
  visibleColumns: BoardColumn[],
  sortedByColumn: Map<string, IssueItem[]>,
  colVisible: Record<string, number>,
  collapsedCols: Set<string>,
  activeFilterCount: number
) {
  const seen = new Map<string, number>();
  return visibleColumns.map((c, i) => {
    const idxInCat = seen.get(c.category) ?? 0;
    seen.set(c.category, idxInCat + 1);
    const all = sortedByColumn.get(c.key) ?? [];
    const count = colVisible[c.key] ?? COL_BATCH;
    const emptyMessage = c.isBacklog
      ? (activeFilterCount > 0 ? "Không có task Backlog khớp bộ lọc" : "Không có task Backlog")
      : undefined;
    return {
      id: c.key,
      label: c.label,
      category: c.category,
      isDone: c.isDone,
      isBacklog: c.isBacklog,
      emptyMessage,
      colIndex: i,
      columnCount: visibleColumns.length,
      dotColor: statusDot(c.category, idxInCat),
      items: all.slice(0, count),
      total: all.length,
      wipOver: c.category === "indeterminate" && all.length > WIP_LIMIT,
      collapsed: collapsedCols.has(c.key),
    };
  });
}
