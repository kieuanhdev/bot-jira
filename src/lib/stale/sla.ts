import { env } from "@/lib/env";

export type StaleSeverity = "info" | "warning" | "high";

export interface SlaThreshold {
  days: number;
  severity: StaleSeverity;
}

const BLOCKED_KEYWORDS = ["blocked", "waiting", "stuck", "on hold", "pending"];

/** True when the raw Jira status name indicates a blocked state. */
export function isBlockedStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return BLOCKED_KEYWORDS.some((k) => s.includes(k));
}

/**
 * Resolve the SLA threshold (days + severity) for a given raw Jira status.
 * Precedence: Blocked > In Review / QA > In Progress > Backlog > To Do > Unknown.
 */
export function slaForStatus(status: string, statusCategory: string): SlaThreshold {
  if (isBlockedStatus(status)) {
    return { days: env.staleBlockedDays, severity: "high" };
  }
  const s = status.toLowerCase().trim();
  if (s.includes("review")) {
    return { days: env.staleReviewDays, severity: "warning" };
  }
  if (s.includes("qa") || s.includes("test") || s.includes("verification")) {
    return { days: env.staleQaDays, severity: "warning" };
  }
  if (statusCategory === "indeterminate") {
    return { days: env.staleInProgressDays, severity: "warning" };
  }
  if (s.includes("backlog") || s.includes("parked") || s.includes("someday") || s.includes("later")) {
    return { days: env.staleBacklogDays, severity: "info" };
  }
  if (statusCategory === "new") {
    return { days: env.staleTodoDays, severity: "warning" };
  }
  return { days: env.staleUnknownDays, severity: "warning" };
}

/**
 * Given the age in days in the current state, return whether the task
 * exceeds its SLA and by how many days.
 */
export function slaExceeded(stateAgeDays: number, sla: SlaThreshold): { exceeded: boolean; overBy: number } {
  if (stateAgeDays < sla.days) return { exceeded: false, overBy: 0 };
  return { exceeded: true, overBy: stateAgeDays - sla.days };
}
