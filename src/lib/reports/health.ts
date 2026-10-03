import type { HealthStatus, HealthReason, ProgressMetric, ReportFreshness, HealthMode } from "./types";
import type { ReportIssueInput } from "./metrics";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { isBlockedStatus, slaForStatus, slaExceeded } from "@/lib/stale/sla";
import { businessDaysBetween, overdueBusinessDays } from "@/lib/stale/business-days";

export interface HealthEvaluationInput {
  issues: ReportIssueInput[];
  progress: ProgressMetric;
  freshness: ReportFreshness;
  releaseDate?: Date | null | undefined;
  startDate?: Date | null | undefined;
  timeElapsedPercentage?: number | null;
  scheduleGapPercentage?: number | null;
  now?: Date;
}

export interface HealthEvaluationResult {
  status: HealthStatus;
  mode: HealthMode;
  headline: string;
  reasons: HealthReason[];
}

/**
 * Pure rule engine for Project Health assessment (Section 6.7 of v2 plan)
 * Supports two modes:
 * - Operational health: for whole project / period scope (no fixed release deadline)
 * - Delivery health: when a specific Fix Version with deadline is evaluated
 */
export function calculateProjectHealth(input: HealthEvaluationInput): HealthEvaluationResult {
  const now = input.now ?? new Date();
  const reasons: HealthReason[] = [];
  const mode: HealthMode = input.releaseDate ? "delivery" : "operational";

  const total = input.issues.length;

  // 1. Check unknown: stale Jira freshness or 0 scope
  if (!input.freshness.isFresh) {
    reasons.push({
      code: "STALE_SOURCE",
      message: input.freshness.warning || "Dữ liệu Jira đồng bộ chưa mới hoặc worker bị gián đoạn.",
      severity: "danger",
    });
    return {
      status: "unknown",
      mode,
      headline: "Không đủ độ tin cậy do nguồn dữ liệu đồng bộ đã cũ.",
      reasons,
    };
  }

  if (total === 0) {
    reasons.push({
      code: "EMPTY_SCOPE",
      message: "Chưa có task nào trong phạm vi báo cáo.",
      severity: "info",
    });
    return {
      status: "unknown",
      mode,
      headline: "Chưa có dữ liệu task trong phạm vi đã chọn.",
      reasons,
    };
  }

  // Count task status characteristics
  let openCount = 0;
  let blockedCount = 0;
  let overdueCount = 0;
  let highSeverityBlockerOverSla = false;

  for (const issue of input.issues) {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    if (!isDoneGroup(group)) {
      openCount++;

      // Blocked check
      const isBlocked = group === "Blocked" || isBlockedStatus(issue.status);
      if (isBlocked) {
        blockedCount++;
        const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
        const ageDays = businessDaysBetween(stateDate, now);
        const sla = slaForStatus(issue.status, issue.statusCategory);
        const { exceeded } = slaExceeded(ageDays, sla);
        if (exceeded && sla.severity === "high") {
          highSeverityBlockerOverSla = true;
        }
      }

      // Overdue check
      const overdueDays = overdueBusinessDays(issue.dueDate, now);
      if (overdueDays > 0) {
        overdueCount++;
      }
    }
  }

  // 2. Check completed: 100% done and no open tasks
  if (openCount === 0 && total > 0 && input.progress.percentage === 100) {
    return {
      status: "completed",
      mode,
      headline: "Dự án đã hoàn thành toàn bộ công việc trong phạm vi.",
      reasons: [
        {
          code: "ALL_DONE",
          message: "Tất cả các task trong phạm vi đã chuyển sang hoàn thành.",
          severity: "info",
        },
      ],
    };
  }

  // If in delivery mode, evaluate deadline relative to today
  let deadlinePassed = false;
  let daysUntilDeadline: number | null = null;

  if (mode === "delivery" && input.releaseDate) {
    const rel = new Date(input.releaseDate);
    rel.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const diffMs = rel.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    daysUntilDeadline = diffDays;
    if (diffDays < 0 && openCount > 0) {
      deadlinePassed = true;
    }
  }

  // 3. Evaluate at_risk conditions
  const atRiskReasons: HealthReason[] = [];

  if (deadlinePassed) {
    atRiskReasons.push({
      code: "DEADLINE_PASSED",
      message: `Hạn phát hành đã qua nhưng vẫn còn ${openCount} task chưa hoàn thành.`,
      severity: "danger",
    });
  }

  if (
    daysUntilDeadline !== null &&
    daysUntilDeadline >= 0 &&
    daysUntilDeadline <= 7 &&
    (input.progress.percentage ?? 0) < 70
  ) {
    atRiskReasons.push({
      code: "DEADLINE_IMMINENT_LOW_PROGRESS",
      message: `Hạn chót còn ${daysUntilDeadline} ngày nhưng tiến độ mới đạt ${input.progress.percentage ?? 0}%.`,
      severity: "danger",
    });
  }

  if (input.scheduleGapPercentage != null && input.scheduleGapPercentage > 20) {
    atRiskReasons.push({
      code: "SCHEDULE_GAP_CRITICAL",
      message: `Thời gian đã dùng trôi trước tiến độ thực tế ${input.scheduleGapPercentage}% (nguy cơ trễ hạn cao).`,
      severity: "danger",
    });
  }

  if (highSeverityBlockerOverSla) {
    atRiskReasons.push({
      code: "BLOCKER_OVER_SLA",
      message: "Có task bị nghẽn mức độ nghiêm trọng cao đã vượt ngưỡng SLA.",
      severity: "danger",
    });
  }

  if (mode === "operational" && overdueCount >= 5) {
    atRiskReasons.push({
      code: "MANY_OVERDUE_TASKS",
      message: `Có ${overdueCount} task quá hạn trong dự án, vượt ngưỡng cảnh báo rủi ro vận hành.`,
      severity: "danger",
    });
  }

  if (atRiskReasons.length > 0) {
    return {
      status: "at_risk",
      mode,
      headline: `Dự án có rủi ro cao: ${atRiskReasons[0].message}`,
      reasons: atRiskReasons,
    };
  }

  // 4. Evaluate attention conditions
  const attentionReasons: HealthReason[] = [];

  if (blockedCount > 0) {
    attentionReasons.push({
      code: "HAS_BLOCKED_TASKS",
      message: `Có ${blockedCount} task đang trong trạng thái bị nghẽn cần tháo gỡ.`,
      severity: "warning",
    });
  }

  if (overdueCount > 0) {
    attentionReasons.push({
      code: "HAS_OVERDUE_TASKS",
      message: `Có ${overdueCount} task đã quá ngày hết hạn dự kiến.`,
      severity: "warning",
    });
  }

  if (
    input.scheduleGapPercentage != null &&
    input.scheduleGapPercentage >= 10 &&
    input.scheduleGapPercentage <= 20
  ) {
    attentionReasons.push({
      code: "SCHEDULE_GAP_WARNING",
      message: `Khoảng cách giữa thời gian trôi qua và tiến độ là ${input.scheduleGapPercentage}%.`,
      severity: "warning",
    });
  }

  if (attentionReasons.length > 0) {
    return {
      status: "attention",
      mode,
      headline: `Dự án cần chú ý: ${attentionReasons[0].message}`,
      reasons: attentionReasons,
    };
  }

  // 5. Otherwise healthy
  return {
    status: "healthy",
    mode,
    headline:
      mode === "delivery"
        ? "Dự án đang triển khai đúng tiến độ và không có cảnh báo nghiêm trọng."
        : "Dự án vận hành ổn định trong kỳ, không có cảnh báo nghẽn nghiêm trọng.",
    reasons: [
      {
        code: "ON_TRACK",
        message: "Tiến độ công việc và luồng vận hành phù hợp với kế hoạch.",
        severity: "info",
      },
    ],
  };
}
