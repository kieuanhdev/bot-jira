export const PRIORITIES = [
  "Blocker",
  "Highest",
  "High",
  "Medium",
  "Low",
  "Lowest",
] as const;

export type PriorityName = (typeof PRIORITIES)[number];

export function toName(t: { to?: { name?: string } | string } | undefined): string {
  if (!t) return "";
  return typeof t.to === "string" ? t.to : t.to?.name ?? "";
}

export function statusCatOf(
  t: { to?: { name?: string } | string } | undefined,
  i: { statusCategory?: string }
): boolean {
  const n = toName(t).toLowerCase();
  return /done|resolved|closed|complete/.test(n) || i.statusCategory === "done";
}

/**
 * The label this app uses to mark an impediment.
 *
 * NOTE: this is a plain Jira label, not Jira's own "Add flag" (which writes the
 * `Flagged` custom field). The menu wording says "nhãn Impediment" so the two
 * are not confused.
 */
export const FLAG_LABEL = "Impediment";

/** Local-time `YYYY-MM-DD`, the format Jira's `duedate` field expects. */
export function toJiraDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Jira-style due-date shortcuts, resolved against the browser's local day. */
export function dueDatePresets(now: Date = new Date()): { label: string; value: string }[] {
  const at = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return toJiraDate(d);
  };
  // Friday of the current week (Sunday = 0), never in the past.
  const toFriday = (5 - now.getDay() + 7) % 7;
  return [
    { label: "Hôm nay", value: at(0) },
    { label: "Ngày mai", value: at(1) },
    { label: "Thứ Sáu này", value: at(toFriday) },
    { label: "Tuần sau", value: at(7) },
  ];
}
