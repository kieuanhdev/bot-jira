import type { ReportStatusGroup } from "./types";

export const REPORT_STATUS_GROUPS: ReportStatusGroup[] = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "QA/Test",
  "Blocked",
  "Done",
  "Unknown",
];

const BLOCKED_KEYWORDS = ["blocked", "stuck", "on hold", "pending approval", "waiting for external"];
const DONE_KEYWORDS = ["done", "closed", "resolved", "cancelled", "canceled", "finished", "released"];
const QA_KEYWORDS = ["qa", "test", "verification", "testing", "qc", "uat"];
const REVIEW_KEYWORDS = ["review", "in review", "peer review", "code review", "pr review"];
const PROGRESS_KEYWORDS = ["progress", "active", "in progress", "working", "doing", "implementing", "developing"];
const BACKLOG_KEYWORDS = ["backlog", "parked", "someday", "later", "icebox"];
const TODO_KEYWORDS = ["todo", "to do", "new", "open", "ready", "unstarted", "selected for development"];

/**
 * Normalizes an arbitrary Jira status name and statusCategory into a standard
 * ReportStatusGroup for portfolio and project reporting (Section 5.1).
 *
 * Precedence:
 * 1. Blocked
 * 2. Done
 * 3. QA/Test
 * 4. In Review
 * 5. In Progress
 * 6. Backlog
 * 7. To Do
 * 8. Category fallbacks
 * 9. Unknown
 */
export function normalizeStatusToGroup(
  status: string | null | undefined,
  statusCategory?: string | null | undefined
): ReportStatusGroup {
  const s = (status ?? "").toLowerCase().trim();
  const cat = (statusCategory ?? "").toLowerCase().trim();

  if (!s && !cat) return "Unknown";

  if (BLOCKED_KEYWORDS.some((k) => s.includes(k))) return "Blocked";
  if (DONE_KEYWORDS.some((k) => s.includes(k))) return "Done";
  if (QA_KEYWORDS.some((k) => s.includes(k))) return "QA/Test";
  if (REVIEW_KEYWORDS.some((k) => s.includes(k)) || /\bpr\b/.test(s)) return "In Review";
  if (PROGRESS_KEYWORDS.some((k) => s.includes(k))) return "In Progress";
  if (BACKLOG_KEYWORDS.some((k) => s.includes(k))) return "Backlog";
  if (TODO_KEYWORDS.some((k) => s.includes(k))) return "To Do";

  if (cat === "done") return "Done";
  if (cat === "indeterminate") return "In Progress";
  if (cat === "new") return "To Do";

  return "Unknown";
}

/** Check if the status belongs to Done group */
export function isDoneGroup(group: ReportStatusGroup): boolean {
  return group === "Done";
}

/** Check if the status group counts towards WIP (In Progress, In Review, QA/Test) */
export function isWipGroup(group: ReportStatusGroup): boolean {
  return group === "In Progress" || group === "In Review" || group === "QA/Test";
}

/** Color tokens and styles matching design system for each status group */
export const REPORT_STATUS_STYLE: Record<
  ReportStatusGroup,
  { label: string; dot: string; text: string; bg: string; chartColor: string }
> = {
  Backlog: {
    label: "Backlog",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800",
    chartColor: "oklch(0.65 0.02 260)",
  },
  "To Do": {
    label: "Chờ làm",
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/40",
    chartColor: "oklch(0.65 0.15 230)",
  },
  "In Progress": {
    label: "Đang làm",
    dot: "bg-teal-600",
    text: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    chartColor: "oklch(0.6 0.108 184.7)",
  },
  "In Review": {
    label: "Đang review",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    chartColor: "oklch(0.7 0.14 75)",
  },
  "QA/Test": {
    label: "QA / Test",
    dot: "bg-indigo-500",
    text: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    chartColor: "oklch(0.6 0.16 280)",
  },
  Blocked: {
    label: "Bị nghẽn",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/40",
    chartColor: "oklch(0.6 0.22 25)",
  },
  Done: {
    label: "Hoàn thành",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    chartColor: "oklch(0.65 0.15 145)",
  },
  Unknown: {
    label: "Chưa phân loại",
    dot: "bg-zinc-400",
    text: "text-zinc-500 dark:text-zinc-400",
    bg: "bg-zinc-100 dark:bg-zinc-800",
    chartColor: "oklch(0.5 0 0)",
  },
};
