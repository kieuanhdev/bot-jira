import type { IssueItem } from "@/hooks/use-issues";
import {
  PRIORITY_RANK,
  PRIORITY_META,
  PRIORITY_NEUTRAL,
  CATEGORY_DOTS,
  CATEGORY_TEXT,
  type SortMode,
} from "./board-types";

export { avatarClass, initials } from "@/lib/avatar";

export function daysSince(d: string | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export function sortIssues(items: IssueItem[], mode: SortMode): IssueItem[] {
  // Parse each date once instead of inside the comparator (O(n log n) Date parses).
  const decorated = items.map((issue) => ({
    issue,
    ts: issue.updatedAt ? new Date(issue.updatedAt).getTime() : 0,
    rank: PRIORITY_RANK[issue.priority] ?? 9,
  }));
  const now = Date.now();
  const age = (ts: number) => (ts ? Math.floor((now - ts) / 86_400_000) : 0);
  if (mode === "priority") {
    decorated.sort((a, b) => a.rank - b.rank || age(b.ts) - age(a.ts));
  } else if (mode === "updated") {
    decorated.sort((a, b) => b.ts - a.ts || a.rank - b.rank);
  } else {
    decorated.sort((a, b) => age(b.ts) - age(a.ts));
  }
  return decorated.map((d) => d.issue);
}

export function priorityMeta(priority: string) {
  return PRIORITY_META[priority] ?? PRIORITY_NEUTRAL;
}

export function typeShort(type: string): string {
  const t = type.trim();
  const map: Record<string, string> = {
    "Story": "Story", "Task": "Task", "Bug": "Bug",
    "Sub-task": "Sub", "Sub Task": "Sub", "Subtask": "Sub",
    "Epic": "Epic", "Sprint Goal": "Goal",
    "Test": "Test", "Test Case": "Test", "Risk": "Risk",
  };
  return map[t] ?? t.slice(0, 4);
}

export function statusDot(category: string, idxInCategory: number): string {
  const arr = CATEGORY_DOTS[category] ?? CATEGORY_DOTS.new;
  return arr[idxInCategory % arr.length];
}

export function statusText(category: string): string {
  return CATEGORY_TEXT[category] ?? CATEGORY_TEXT.new;
}

export function columnKeyForIssue(
  issue: IssueItem,
  columnKeyByStatus: Map<string, string>,
  _statusCategoryMap: Record<string, string>,
  columns: Array<{ key: string; category: string; statusIds?: string[] }>,
  columnKeyByStatusId?: Map<string, string>
): string {
  if (issue.statusId && columnKeyByStatusId?.has(issue.statusId)) {
    return columnKeyByStatusId.get(issue.statusId)!;
  }
  const byName = columnKeyByStatus.get(issue.status);
  if (byName) return byName;

  const normalized = (issue.status || "").trim().toLowerCase();
  for (const [name, key] of columnKeyByStatus.entries()) {
    if (name.toLowerCase() === normalized) return key;
  }

  // Exact fallback: if a column has this exact key, use it
  const targetKey = issue.statusId ? `status:${issue.statusId}` : `status:${issue.status || "unknown"}`;
  if (columns.some((c) => c.key === targetKey)) {
    return targetKey;
  }

  return targetKey;
}
