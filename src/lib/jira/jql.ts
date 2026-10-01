import { env, jiraProjectList } from "@/lib/env";

export function escapeJql(value: string): string {
  // Wrap in double quotes and escape embedded quotes.
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** JQL clause restricting to the configured project keys. */
export function projectClause(projectKey?: string, fallbackProjects?: string[]): string {
  if (projectKey) return `project = ${projectKey.toUpperCase()}`;
  const list = fallbackProjects ?? jiraProjectList;
  if (list.length === 1) return `project = ${list[0]}`;
  if (list.length > 1) return `project in (${list.join(", ")})`;
  return `project in ()`;
}

/** Default poll JQL: ALL issues (any status, any age) across the configured projects. */
export function buildDefaultPollJql(projects?: string[]): string {
  const parts = [projectClause(undefined, projects)];
  if (env.jiraJqlExtra) parts.push(env.jiraJqlExtra);
  return parts.join(" AND ");
}

/** Jira accepts this minute-resolution format in quoted JQL date literals. */
export function formatJqlDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Project-scoped incremental sync query with deterministic ordering. */
export function buildProjectPollJql(projectKey: string, updatedSince?: Date): string {
  const parts = [projectClause(projectKey)];
  if (updatedSince) parts.push(`updated >= ${escapeJql(formatJqlDate(updatedSince))}`);
  if (env.jiraJqlExtra) parts.push(`(${env.jiraJqlExtra})`);
  return `${parts.join(" AND ")} ORDER BY updated ASC, key ASC`;
}

export type BoardQuery = {
  project?: string;
  assignee?: string;
  label?: string;
  priority?: string;
  status?: string;
  points?: string;
  releaseLabel?: string;
  q?: string;
};

/** Build a JQL string for board filtering + search. */
export function buildBoardJql(query: BoardQuery = {}, projects?: string[]): string {
  const clauses: string[] = [];
  const list = projects ?? jiraProjectList;
  if (query.project || list.length) clauses.push(projectClause(query.project, projects));
  if (query.status) clauses.push(`status = ${escapeJql(query.status)}`);
  else clauses.push("statusCategory != Done");
  if (query.assignee) clauses.push(`assignee = ${escapeJql(query.assignee)}`);
  if (query.label) clauses.push(`labels = ${escapeJql(query.label)}`);
  if (query.priority) clauses.push(`priority = ${escapeJql(query.priority)}`);
  if (query.releaseLabel) clauses.push(`labels = ${escapeJql(query.releaseLabel)}`);
  if (query.points) {
    clauses.push(`"story points" = ${query.points}`);
  }
  if (query.q) {
    // Search in key or summary.
    clauses.push(`(text ~ ${escapeJql(query.q)} OR key ~ ${escapeJql(query.q)})`);
  }
  return clauses.join(" AND ");
}
