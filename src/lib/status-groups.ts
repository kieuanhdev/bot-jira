export type StatusGroup = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done";

export const STATUS_GROUPS: StatusGroup[] = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Done",
];

const DONE_KEYWORDS = ["done", "closed", "resolved", "cancelled", "canceled"];
const REVIEW_KEYWORDS = ["review", "qa", "test", "verification"];
const PROGRESS_KEYWORDS = ["progress", "active", "in progress", "working", "doing"];
const BACKLOG_KEYWORDS = ["backlog", "parked", "someday", "later"];
const TODO_KEYWORDS = ["todo", "to do", "new", "open", "ready", "unstarted", "unstarted"];

/**
 * Map an arbitrary Jira status name into one of the 5 fixed board columns.
 * Order of checks matters: Done is most specific, then Review, then Progress.
 * Falls back to "To Do" (the default active bucket).
 */
export function statusGroup(status: string): StatusGroup {
  const s = status.toLowerCase().trim();
  if (!s) return "To Do";
  if (DONE_KEYWORDS.some((k) => s.includes(k))) return "Done";
  if (REVIEW_KEYWORDS.some((k) => s.includes(k))) return "In Review";
  if (PROGRESS_KEYWORDS.some((k) => s.includes(k))) return "In Progress";
  if (BACKLOG_KEYWORDS.some((k) => s.includes(k))) return "Backlog";
  if (TODO_KEYWORDS.some((k) => s.includes(k))) return "To Do";
  return "To Do";
}

/** Accent + dot color per group, used for the column header and summary tiles. */
export const STATUS_GROUP_STYLE: Record<StatusGroup, { dot: string; text: string }> = {
  Backlog: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  "To Do": { dot: "bg-sky-500", text: "text-sky-600 dark:text-sky-400" },
  "In Progress": { dot: "bg-primary", text: "text-primary" },
  "In Review": { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  Done: { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};

export type BoardWidth = "wide" | "medium" | "narrow";

/**
 * Which columns are visible on a kanban board at a given width.
 * - wide (≥1280px): all 5 columns.
 * - medium (768–1279px): 3 active columns (In Progress / In Review / Done);
 *   Backlog + To Do are merged into a single "Queued" column.
 * - narrow (<768px): kanban is not usable → the board falls back to List view
 *   (the caller decides; this returns [] as a hint to not render kanban).
 */
export type BoardColumn =
  | { kind: "group"; group: StatusGroup }
  | { kind: "merge"; id: "Queued"; groups: [StatusGroup, StatusGroup]; label: string };

export function boardColumnsForWidth(width: BoardWidth): BoardColumn[] {
  if (width === "wide") {
    return STATUS_GROUPS.map((g) => ({ kind: "group" as const, group: g }));
  }
  if (width === "medium") {
    return [
      { kind: "merge", id: "Queued", groups: ["Backlog", "To Do"], label: "Queued" },
      { kind: "group", group: "In Progress" },
      { kind: "group", group: "In Review" },
      { kind: "group", group: "Done" },
    ];
  }
  return [];
}
