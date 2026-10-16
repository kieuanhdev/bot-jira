/**
 * Unified status styling, color tokens, and badge variants.
 * Client bundle safe: zero external dependencies, zero Node built-ins.
 */

export type StatusCategoryKey = "new" | "indeterminate" | "done";

export const CATEGORY_ORDER = ["new", "indeterminate", "done"] as const;

export const CATEGORY_DOTS: Record<string, string[]> = {
  new: [
    "bg-sky-400",
    "bg-cyan-500",
    "bg-blue-400",
    "bg-indigo-400",
    "bg-teal-400",
    "bg-sky-600",
    "bg-cyan-400",
    "bg-blue-500",
  ],
  indeterminate: [
    "bg-primary",
    "bg-cyan-500",
    "bg-sky-600",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-primary/70",
  ],
  done: [
    "bg-emerald-500",
    "bg-green-500",
    "bg-teal-500",
    "bg-lime-500",
    "bg-emerald-400",
    "bg-green-400",
  ],
};

export const CATEGORY_TEXT: Record<string, string> = {
  new: "text-sky-600 dark:text-sky-400",
  indeterminate: "text-primary",
  done: "text-emerald-600 dark:text-emerald-400",
};

/**
 * Single-dot colors per category group (used in stale and board headers).
 */
export const GROUP_DOT: Record<string, string> = {
  Backlog: "bg-muted-foreground/50",
  "To Do": "bg-sky-500",
  "In Progress": "bg-primary",
  "In Review": "bg-amber-500",
  Done: "bg-emerald-500",
};

/**
 * Legacy category dot mapping.
 * // Deferred pending D13: color unification
 */
export const CATEGORY_DOT_MAP: Record<string, string> = {
  new: "bg-slate-400",
  indeterminate: "bg-amber-400",
  done: "bg-emerald-500",
};

export interface CategoryStyle {
  dot: string;
  dots: string[];
  text: string;
  badgeVariant: "info" | "secondary" | "success" | "warning" | "outline";
}

export const STATUS_CATEGORY_STYLE: Record<StatusCategoryKey, CategoryStyle> = {
  new: {
    dot: "bg-sky-500",
    dots: CATEGORY_DOTS.new,
    text: CATEGORY_TEXT.new,
    badgeVariant: "info",
  },
  indeterminate: {
    dot: "bg-primary",
    dots: CATEGORY_DOTS.indeterminate,
    text: CATEGORY_TEXT.indeterminate,
    badgeVariant: "secondary",
  },
  done: {
    dot: "bg-emerald-500",
    dots: CATEGORY_DOTS.done,
    text: CATEGORY_TEXT.done,
    badgeVariant: "success",
  },
};

/**
 * Pick a cycling dot color for a status item within a category.
 */
export function getCategoryDot(category: string, idx: number = 0): string {
  const arr = CATEGORY_DOTS[category] ?? CATEGORY_DOTS.new;
  return arr[Math.abs(idx) % arr.length];
}

/**
 * Return semantic badge variant for a category key.
 */
export function getCategoryBadgeVariant(
  category: string
): "info" | "secondary" | "success" | "warning" | "outline" {
  const cat = category as StatusCategoryKey;
  return STATUS_CATEGORY_STYLE[cat]?.badgeVariant ?? "outline";
}
