import type { RiskTaskItem, RiskReason } from "./types";
import type { ReportIssueInput } from "./metrics";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { isBlockedStatus, slaForStatus, slaExceeded } from "@/lib/stale/sla";
import { businessDaysBetween, overdueBusinessDays } from "@/lib/stale/business-days";

export function evaluateRiskTask(
  issue: ReportIssueInput,
  now: Date = new Date()
): RiskTaskItem | null {
  const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
  if (isDoneGroup(group)) return null;

  const risks: RiskReason[] = [];

  const isBlocked = group === "Blocked" || isBlockedStatus(issue.status);
  if (isBlocked) {
    risks.push("blocked");
  }

  const overdueDays = overdueBusinessDays(issue.dueDate, now);
  if (overdueDays > 0) {
    risks.push("overdue");
  }

  const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
  const stateAgeDays = businessDaysBetween(stateDate, now);
  const sla = slaForStatus(issue.status, issue.statusCategory);
  const { exceeded, overBy } = slaExceeded(stateAgeDays, sla);
  if (exceeded) {
    risks.push("over_sla");
  }

  const isUnassigned = !issue.assigneeJira || issue.assigneeJira.trim() === "";
  if (isUnassigned) {
    risks.push("unassigned");
  }

  if (risks.length === 0) return null;

  let severity: "info" | "warning" | "high" = "info";
  if (
    (isBlocked && sla.severity === "high") ||
    overdueDays >= 5 ||
    overBy >= 5
  ) {
    severity = "high";
  } else if (isBlocked || overdueDays > 0 || exceeded) {
    severity = "warning";
  }

  return {
    jiraKey: issue.jiraKey,
    projectKey: issue.projectKey,
    summary: issue.summary,
    status: issue.status,
    statusGroup: group,
    assigneeJira: issue.assigneeJira,
    assigneeDisplayName: issue.assigneeJira || "Chưa phân công",
    priority: issue.priority,
    points: issue.points,
    originalEstimateSeconds: issue.originalEstimateSeconds,
    dueDate: issue.dueDate ? issue.dueDate.toISOString().split("T")[0] : null,
    risks,
    stateAgeDays,
    blockedDays: isBlocked ? stateAgeDays : 0,
    overdueDays,
    slaDays: sla.days,
    severity,
  };
}

export function sortRiskTasks(tasks: RiskTaskItem[]): RiskTaskItem[] {
  const severityScore = { high: 3, warning: 2, info: 1 };
  return [...tasks].sort((a, b) => {
    const sDiff = severityScore[b.severity] - severityScore[a.severity];
    if (sDiff !== 0) return sDiff;
    const oDiff = b.overdueDays - a.overdueDays;
    if (oDiff !== 0) return oDiff;
    const bDiff = b.blockedDays - a.blockedDays;
    if (bDiff !== 0) return bDiff;
    return b.stateAgeDays - a.stateAgeDays;
  });
}
