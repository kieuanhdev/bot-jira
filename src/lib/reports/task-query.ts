import { normalizeProjectKey } from "@/lib/jira/project-catalog";
import type { ProjectTasksResponse, ReportPeriod } from "./types";
import { resolveProjectVersionFilter } from "./version";
import {
  buildProjectIssueWhere,
  fetchTaskExplorerIssues,
  fetchAssigneeDisplayNameMap,
} from "./query-primitives";
import { evaluateTaskExplorerItems } from "./task-calculator";

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

  // Fetch candidate issues via query primitive
  const rawIssues = await fetchTaskExplorerIssues(whereClause);

  // Collect user display names for assignees
  const userMap = await fetchAssigneeDisplayNameMap(
    rawIssues.map((i) => i.assigneeJira)
  );

  // Evaluate tasks via pure calculator
  const { items, total } = evaluateTaskExplorerItems(rawIssues, {
    period,
    now,
    activity: activity ?? "all",
    risk: risk ?? "all",
    statusGroup: statusGroup ?? "all",
    assignee: assignee ?? "all",
    search: search ?? "",
    userMap,
    offset,
    limit,
  });

  return {
    tasks: items,
    total,
    limit,
    offset,
    period,
  };
}
