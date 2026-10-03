import type { MemberReportItem, SupportSignal } from "./types";
import { normalizeStatusToGroup, isDoneGroup, isWipGroup } from "./status";
import { isBlockedStatus, slaForStatus, slaExceeded } from "@/lib/stale/sla";
import { businessDaysBetween } from "@/lib/stale/business-days";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";
import type { ReportIssueInput } from "./metrics";

export interface CalculateMemberMetricsInput {
  issues: ReportIssueInput[];
  from: string;
  to: string;
  timezone: string;
  now?: Date;
  previousPeriodCompletions?: Map<string, number>;
  userDisplayNames?: Map<string, string>;
}

export function calculateMemberMetrics(
  input: CalculateMemberMetricsInput
): MemberReportItem[] {
  const {
    issues,
    from,
    to,
    timezone,
    now = new Date(),
    previousPeriodCompletions,
    userDisplayNames,
  } = input;

  const memberStats = new Map<
    string,
    {
      assignee: string;
      displayName: string;
      completedTasks: number;
      completedPoints: number;
      completedEstimateSeconds: number;
      currentWip: number;
      currentBlocked: number;
      currentOverdue: number;
      currentOverSla: number;
      assignedOpenTasks: number;
      maxBlockedAgeDays: number;
      maxWipAgeDays: number;
    }
  >();

  function getOrCreate(assigneeKey: string | null) {
    const key = assigneeKey?.trim() || "unassigned";
    if (!memberStats.has(key)) {
      const displayName =
        key === "unassigned"
          ? "Chưa phân công (Unassigned)"
          : userDisplayNames?.get(key) || key;

      memberStats.set(key, {
        assignee: key,
        displayName,
        completedTasks: 0,
        completedPoints: 0,
        completedEstimateSeconds: 0,
        currentWip: 0,
        currentBlocked: 0,
        currentOverdue: 0,
        currentOverSla: 0,
        assignedOpenTasks: 0,
        maxBlockedAgeDays: 0,
        maxWipAgeDays: 0,
      });
    }
    return memberStats.get(key)!;
  }

  for (const issue of issues) {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    const isDone = isDoneGroup(group);
    const assigneeKey = issue.assigneeJira;
    const stat = getOrCreate(assigneeKey);

    const pts = issue.points ?? 0;
    const est = issue.originalEstimateSeconds ?? 0;

    // Check completion in period
    const resolved = resolveCompletionDate({
      status: issue.status,
      statusCategory: issue.statusCategory,
      statusChangedAt: issue.statusChangedAt,
      raw: issue.raw,
    });

    if (resolved.date && isDateInPeriod(resolved.date, from, to, timezone)) {
      stat.completedTasks++;
      stat.completedPoints += pts;
      stat.completedEstimateSeconds += est;
    }

    // Current state (open at end)
    if (!isDone) {
      stat.assignedOpenTasks++;

      const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
      const ageDays = businessDaysBetween(stateDate, now);

      if (isWipGroup(group)) {
        stat.currentWip++;
        if (ageDays > stat.maxWipAgeDays) stat.maxWipAgeDays = ageDays;
      }

      const isBlocked = group === "Blocked" || isBlockedStatus(issue.status);
      if (isBlocked) {
        stat.currentBlocked++;
        if (ageDays > stat.maxBlockedAgeDays) stat.maxBlockedAgeDays = ageDays;
      }

      if (issue.dueDate && isDateInPeriod(issue.dueDate, "1970-01-01", to, timezone)) {
        stat.currentOverdue++;
      }

      const sla = slaForStatus(issue.status, issue.statusCategory);
      if (slaExceeded(ageDays, sla).exceeded) {
        stat.currentOverSla++;
      }
    }
  }

  const result: MemberReportItem[] = [];

  for (const stat of memberStats.values()) {
    // Determine support signal
    let supportSignal: SupportSignal = "balanced";
    const supportReasons: string[] = [];

    if (stat.assignee === "unassigned") {
      if (stat.assignedOpenTasks > 0) {
        supportSignal = "needs_unblock";
        supportReasons.push(`${stat.assignedOpenTasks} việc đang mở chưa có người nhận`);
      } else {
        supportSignal = "balanced";
      }
    } else {
      if (stat.assignedOpenTasks === 0 && stat.completedTasks === 0) {
        supportSignal = "insufficient_data";
        supportReasons.push("Không có task nào được giao hoặc xử lý trong kỳ");
      } else if (stat.currentBlocked >= 2 || (stat.currentBlocked > 0 && stat.maxBlockedAgeDays >= 3)) {
        supportSignal = "needs_unblock";
        supportReasons.push(
          `Có ${stat.currentBlocked} việc bị tắc (tắc lâu nhất ${stat.maxBlockedAgeDays} ngày làm việc)`
        );
      } else if (stat.currentOverdue > 0 || stat.currentOverSla >= 2) {
        supportSignal = "needs_unblock";
        if (stat.currentOverdue > 0) {
          supportReasons.push(`Có ${stat.currentOverdue} việc quá hạn`);
        }
        if (stat.currentOverSla >= 2) {
          supportReasons.push(`Có ${stat.currentOverSla} việc vượt SLA trạng thái`);
        }
      } else if (stat.currentWip >= 4 || (stat.currentWip >= 3 && stat.maxWipAgeDays >= 5)) {
        supportSignal = "high_load";
        supportReasons.push(
          `Đang xử lý đồng thời ${stat.currentWip} việc (lâu nhất ${stat.maxWipAgeDays} ngày làm việc)`
        );
      } else {
        supportSignal = "balanced";
        supportReasons.push("Khối lượng công việc và tiến độ xử lý ổn định");
      }
    }

    const prevDone = previousPeriodCompletions?.get(stat.assignee);
    const deltaCompletedTasks =
      prevDone !== undefined ? stat.completedTasks - prevDone : null;

    result.push({
      assignee: stat.assignee,
      displayName: stat.displayName,
      completedTasks: stat.completedTasks,
      completedPoints: stat.completedPoints,
      completedEstimateSeconds: stat.completedEstimateSeconds,
      currentWip: stat.currentWip,
      currentBlocked: stat.currentBlocked,
      currentOverdue: stat.currentOverdue,
      currentOverSla: stat.currentOverSla,
      assignedOpenTasks: stat.assignedOpenTasks,
      deltaCompletedTasks,
      supportSignal,
      supportReasons,
    });
  }

  // Sort alphabetically by displayName, unassigned at the end
  result.sort((a, b) => {
    if (a.assignee === "unassigned") return 1;
    if (b.assignee === "unassigned") return -1;
    return a.displayName.localeCompare(b.displayName);
  });

  return result;
}
