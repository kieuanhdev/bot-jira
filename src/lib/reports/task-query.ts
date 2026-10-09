import { prisma } from "@/lib/prisma";
import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type {
  ProjectTasksResponse,
  TaskExplorerItem,
  TaskActivityType,
  RiskReason,
  ReportPeriod,
} from "./types";
import { normalizeStatusToGroup, isDoneGroup } from "./status";
import { isBlockedStatus, slaForStatus, slaExceeded } from "@/lib/stale/sla";
import { businessDaysBetween, overdueBusinessDays } from "@/lib/stale/business-days";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";
import { resolveProjectVersionFilter } from "./version";
import {
  buildProjectIssueWhere,
  REPORT_TASK_EXPLORER_SELECT,
  fetchAssigneeDisplayNameMap,
} from "./query-primitives";

export interface TaskQueryParams {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
  activity?: string | null;
  statusGroup?: string | null;
  assignee?: string | null;
  risk?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export async function getProjectTasks(
  params: TaskQueryParams
): Promise<ProjectTasksResponse> {
  const normalizedKey = normalizeProjectKey(params.projectKey);
  const { period, versionId, activity, statusGroup, assignee, risk, search } = params;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const now = new Date();

  // Resolve version filter using unified resolver
  const resolvedVersion = await resolveProjectVersionFilter(normalizedKey, versionId);

  // Construct query where clause
  const whereClause = buildProjectIssueWhere(normalizedKey, resolvedVersion?.whereInput);

  // Fetch candidate issues
  const rawIssues = await prisma.issueCache.findMany({
    where: whereClause,
    select: REPORT_TASK_EXPLORER_SELECT,
    orderBy: [{ priority: "asc" }, { jiraKey: "desc" }],
  });

  // Collect user display names for assignees
  const userMap = await fetchAssigneeDisplayNameMap(
    rawIssues.map((i) => i.assigneeJira)
  );

  // Evaluate each task
  const explorerItems: TaskExplorerItem[] = [];

  for (const issue of rawIssues) {
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
      resolved.date &&
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
    if (issue.createdAt && issue.createdAt.getTime() > new Date(`${period.to}T23:59:59.999Z`).getTime()) {
      continue;
    }

    // Exclude tasks already completed before period start
    if (isDone && !isCompletedInPeriod) {
      const completionDate = resolved.date || issue.statusChangedAt;
      if (completionDate && completionDate.getTime() < new Date(`${period.from}T00:00:00.000Z`).getTime()) {
        continue;
      }
      if (issue.updatedAt && issue.updatedAt.getTime() < new Date(`${period.from}T00:00:00.000Z`).getTime()) {
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
    tasks: pagedTasks,
    total,
    limit,
    offset,
    period,
  };
}
