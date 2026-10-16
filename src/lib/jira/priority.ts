/**
 * Canonical Jira priorities, rankings, and high-priority predicates.
 * Client bundle safe: zero external dependencies, zero Node built-ins.
 */

export const PRIORITIES = [
  "Blocker",
  "Highest",
  "High",
  "Medium",
  "Low",
  "Lowest",
] as const;

export type PriorityName = (typeof PRIORITIES)[number];

export const PRIORITY_RANK: Record<string, number> = {
  Blocker: 0,
  Highest: 1,
  High: 2,
  Medium: 3,
  Low: 4,
  Lowest: 5,
};

export const PRIORITY_META: Record<string, { rail: string; badge: string }> = {
  Blocker: { rail: "bg-rose-500", badge: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  Highest: { rail: "bg-rose-400", badge: "bg-rose-400/12 text-rose-600 dark:text-rose-400" },
  High: { rail: "bg-amber-500", badge: "bg-amber-500/12 text-amber-700 dark:text-amber-400" },
  Medium: { rail: "bg-sky-400", badge: "bg-sky-500/12 text-sky-700 dark:text-sky-400" },
  Low: { rail: "bg-slate-300 dark:bg-slate-600", badge: "bg-muted text-muted-foreground" },
  Lowest: { rail: "bg-slate-300 dark:bg-slate-600", badge: "bg-muted text-muted-foreground" },
};

export const PRIORITY_NEUTRAL = { rail: "bg-transparent", badge: "bg-muted text-muted-foreground" };

/**
 * Returns true if the priority is considered high severity (Blocker, Highest, or High).
 */
export function isHighPriority(priority?: string | null): boolean {
  if (!priority) return false;
  return priority === "Blocker" || priority === "Highest" || priority === "High";
}

/**
 * Returns numeric rank for ordering priorities (0 = Blocker, 5 = Lowest).
 * Fallback to 999 for unknown priorities.
 */
export function getPriorityRank(priority?: string | null): number {
  if (!priority) return 999;
  return PRIORITY_RANK[priority] ?? 999;
}
