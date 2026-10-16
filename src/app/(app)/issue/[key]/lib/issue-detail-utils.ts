import type { Transition } from "./issue-detail-types";

// Re-exported so the issue-detail page keeps a single utils entry point while
// the board quick panel shares the same worklog validation.
export { getDefaultLogStartedAt, validateWorklog } from "@/lib/worklogs/schema";

export { PRIORITIES, type PriorityName } from "@/lib/jira/priority";

export function transitionTo(t: Transition): string {
  return typeof t.to === "string" ? t.to : t.to?.name ?? t.name ?? "";
}


