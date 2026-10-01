import type { IssueItem } from "@/hooks/use-issues";
import {
  PRIORITY_RANK,
  PRIORITY_META,
  PRIORITY_NEUTRAL,
  AVATAR_PALETTE,
  CATEGORY_DOTS,
  CATEGORY_TEXT,
  type SortMode,
} from "./board-types";

export function daysSince(d: string | null): number {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export function sortIssues(items: IssueItem[], mode: SortMode): IssueItem[] {
  const arr = [...items];
  if (mode === "priority") {
    arr.sort((a, b) => {
      const ra = PRIORITY_RANK[a.priority] ?? 9;
      const rb = PRIORITY_RANK[b.priority] ?? 9;
      if (ra !== rb) return ra - rb;
      return daysSince(b.updatedAt) - daysSince(a.updatedAt);
    });
  } else if (mode === "updated") {
    arr.sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      const ra = PRIORITY_RANK[a.priority] ?? 9;
      const rb = PRIORITY_RANK[b.priority] ?? 9;
      return ra - rb;
    });
  } else {
    arr.sort((a, b) => daysSince(b.updatedAt) - daysSince(a.updatedAt));
  }
  return arr;
}

export function priorityMeta(priority: string) {
  return PRIORITY_META[priority] ?? PRIORITY_NEUTRAL;
}

export function avatarClass(name: string | null | undefined): string {
  if (!name) return "bg-muted text-muted-foreground";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  statusCategoryMap: Record<string, string>,
  columns: { key: string; category: string }[]
): string {
  const byName = columnKeyByStatus.get(issue.status);
  if (byName) return byName;
  const cat = issue.statusCategory || statusCategoryMap[issue.status] || "new";
  const col = columns.find((c) => c.category === cat) ?? columns[0];
  return col ? col.key : "To Do";
}
