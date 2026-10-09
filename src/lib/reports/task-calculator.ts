import type {
  ReportPeriod,
  TaskExplorerItem,
  TaskActivityType,
  RiskReason,
} from "./types";
import type { RawReportTaskRecord } from "./query-primitives";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { isBlockedStatus, slaForStatus, slaExceeded } from "@/lib/stale/sla";
import { businessDaysBetween, overdueBusinessDays } from "@/lib/stale/business-days";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";

export interface TaskExplorerEvaluationOptions {
  period: ReportPeriod;
  now?: Date;
  activity?: TaskActivityType | "all" | string;
  risk?: RiskReason | "all" | string;
  statusGroup?: string;
  assignee?: string;
  search?: string;
  userMap?: Map<string, string>;
  offset?: number;
  limit?: number;
}

export interface TaskExplorerEvaluationResult {
  items: TaskExplorerItem[];
  total: number;
}

/**
 * Pure calculation and filtering engine for task explorer items.
 * Evaluates activity, risk conditions, status groups, date bounds, and text search without Prisma.
 */
export function evaluateTaskExplorerItems(
  issues: RawReportTaskRecord[],
  options: TaskExplorerEvaluationOptions
): TaskExplorerEvaluationResult {
  const {
    period,
    now = new Date(),
    activity,
    risk,
    statusGroup,
    assignee,
    search,
    userMap = new Map<string, string>(),
    offset = 0,
    limit = 50,
  } = options;

  const explorerItems: TaskExplorerItem[] = [];

  for (const issue of issues) {
    const group = normalizeStatusToGroup(issue.status, issue.statusCategory);
    const isDone = isDoneGroup(group);

    // Resolve completion date
    const resolved = resolveCompletionDate({
      status: issue.status,
      statusCategory: issue.statusCategory,
      statusChangedAt: issue.statusChangedAt,
      raw: issue.raw,
    });

    const isCreatedInPeriod = isDateInPeriod(
      issue.createdAt,
      period.from,
      period.to,
      period.timezone
    );
    const isCompletedInPeriod =
      Boolean(resolved.date) &&
      isDateInPeriod(resolved.date, period.from, period.to, period.timezone);

    let taskActivity: TaskActivityType = "unchanged";
    if (isCompletedInPeriod) {
      taskActivity = "completed";
    } else if (isCreatedInPeriod) {
      taskActivity = "created";
    } else if (!isDone) {
      taskActivity = "current_open";
    }

    // Evaluate risks
    const risks: RiskReason[] = [];
    const stateDate = issue.statusChangedAt ?? issue.updatedAt ?? issue.createdAt;
    const stateAgeDays = businessDaysBetween(stateDate, now);

    if (!isDone) {
      const isBlocked = group === "Blocked" || isBlockedStatus(issue.status);
      if (isBlocked) {
        risks.push("blocked");
      }

      if (overdueBusinessDays(issue.dueDate, now) > 0) {
        risks.push("overdue");
      }

      const sla = slaForStatus(issue.status, issue.statusCategory);
      if (slaExceeded(stateAgeDays, sla).exceeded) {
        risks.push("over_sla");
      }

      if (!issue.assigneeJira || issue.assigneeJira.trim() === "") {
        risks.push("unassigned");
      }
    }

    // Exclude tasks created after period end
    if (
      issue.createdAt &&
      issue.createdAt.getTime() > new Date(`${period.to}T23:59:59.999Z`).getTime()
    ) {
      continue;
    }

    // Exclude tasks already completed before period start
    if (isDone && !isCompletedInPeriod) {
      const completionDate = resolved.date || issue.statusChangedAt;
      if (
        completionDate &&
        completionDate.getTime() < new Date(`${period.from}T00:00:00.000Z`).getTime()
      ) {
        continue;
      }
      if (
        issue.updatedAt &&
        issue.updatedAt.getTime() < new Date(`${period.from}T00:00:00.000Z`).getTime()
      ) {
        continue;
      }
    }

    // Filter by activity
    if (activity && activity !== "all") {
      if (activity === "created" && !isCreatedInPeriod) continue;
      if (activity === "completed" && !isCompletedInPeriod) continue;
      if (activity === "current_open" && isDone) continue;
      if (activity === "blocked" && !risks.includes("blocked")) continue;
      if (activity === "overdue" && !risks.includes("overdue")) continue;
      if (activity === "over_sla" && !risks.includes("over_sla")) continue;
      if (activity === "unassigned" && !risks.includes("unassigned")) continue;
    }

    // Filter by status group
    if (statusGroup && statusGroup !== "all") {
      if (group !== statusGroup) continue;
    }

    // Filter by assignee
    if (assignee && assignee !== "all") {
      if (assignee === "unassigned") {
        if (issue.assigneeJira && issue.assigneeJira.trim() !== "") continue;
      } else if (issue.assigneeJira !== assignee) {
        continue;
      }
    }

    // Filter by risk
    if (risk && risk !== "all") {
      if (!risks.includes(risk as RiskReason)) continue;
    }

    // Filter by search
    if (search && search.trim() !== "") {
      const q = search.trim().toLowerCase();
      const matchKey = issue.jiraKey.toLowerCase().includes(q);
      const matchSummary = issue.summary.toLowerCase().includes(q);
      if (!matchKey && !matchSummary) continue;
    }

    explorerItems.push({
      jiraKey: issue.jiraKey,
      projectKey: issue.projectKey,
      summary: issue.summary,
      status: issue.status,
      statusGroup: group,
      assigneeJira: issue.assigneeJira,
      assigneeDisplayName: issue.assigneeJira
        ? userMap.get(issue.assigneeJira) || issue.assigneeJira
        : null,
      priority: issue.priority,
      points: issue.points,
      originalEstimateSeconds: issue.originalEstimateSeconds,
      dueDate: issue.dueDate ? issue.dueDate.toISOString().split("T")[0] : null,
      createdAt: issue.createdAt ? issue.createdAt.toISOString() : null,
      completedAt: resolved.date ? resolved.date.toISOString() : null,
      activity: taskActivity,
      risks,
      stateAgeDays,
      fixVersionNames: issue.fixVersionNames || [],
    });
  }

  const total = explorerItems.length;
  const pagedTasks = explorerItems.slice(offset, offset + limit);

  return {
    items: pagedTasks,
    total,
  };
}
