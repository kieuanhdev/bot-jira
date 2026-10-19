import { CATEGORY_DOTS } from "./bulk-types";
import type { PreviewItem, PreviewBucket } from "./bulk-types";
import type { SelectionMode } from "./bulk-logic";

export const PREVIEW_PAGE_SIZE = 50;

export const TERMINAL_OP_STATES: readonly string[] = ["completed", "partially_failed", "failed", "cancelled"];

export function isTerminalOpState(state: string | null | undefined): boolean {
  return typeof state === "string" && TERMINAL_OP_STATES.includes(state);
}

export function effectiveCountLabel(input: {
  selectionMode: SelectionMode;
  effectiveCount: number;
  loadedCount: number;
  totalServerIssues: number;
}): { label: string; isLowerBound: boolean } {
  const isLowerBound = input.selectionMode === "filter" && input.loadedCount < input.totalServerIssues;
  const label = isLowerBound ? `≥ ${input.effectiveCount}` : String(input.effectiveCount);
  return { label, isLowerBound };
}

export function itemHasChange(item: PreviewItem): boolean {
  return Object.keys(item.after).some(
    (key) => item.after[key] !== undefined && JSON.stringify(item.before[key]) !== JSON.stringify(item.after[key])
  );
}

export function previewBucket(item: PreviewItem): PreviewBucket {
  if (item.skipReason === "no_change" || item.skipReason === "branch_exists") return "unchanged";
  if (item.skipReason) return "blocked";
  if (["not_in_cache", "no_transition"].includes(item.warning ?? "")) return "blocked";
  if (item.warning) return "warnings";
  return itemHasChange(item) ? "changes" : "unchanged";
}

export function stateVariant(state: string) {
  switch (state) {
    case "completed":
      return "success" as const;
    case "partially_failed":
      return "warning" as const;
    case "failed":
      return "danger" as const;
    case "running":
    case "queued":
      return "info" as const;
    default:
      return "secondary" as const;
  }
}

export function itemVariant(status: string) {
  switch (status) {
    case "succeeded":
      return "success" as const;
    case "failed":
      return "danger" as const;
    case "skipped":
      return "secondary" as const;
    default:
      return "info" as const;
  }
}

export function warningVariant(warning: string): "warning" | "danger" {
  return warning === "stale_data" ? "warning" : "danger";
}

export function categoryOf(status: string, statusCategory?: string): string {
  const c = (statusCategory || "").toLowerCase();
  if (c === "new" || c === "indeterminate" || c === "done") return c;
  const s = status.toLowerCase();
  if (/(done|resolved|closed|complete|released)/.test(s)) return "done";
  if (/(in progress|progress|doing|review|active|deploy)/.test(s)) return "indeterminate";
  return "new";
}

export function statusDot(status: string, category?: string): string {
  const cat = category ?? categoryOf(status);
  const arr = CATEGORY_DOTS[cat] ?? CATEGORY_DOTS.new;
  let h = 0;
  const s = status.toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return arr[h % arr.length];
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function labelList(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ") || "—";
  return v ? String(v) : "—";
}

export { formatSecondsToJira } from "@/lib/format/time";
