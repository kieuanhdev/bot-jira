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
