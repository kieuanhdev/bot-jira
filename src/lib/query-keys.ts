// Central TanStack Query key factory.
//
// Every key here returns EXACTLY the same array that the call sites used to
// write by hand, so cache hits / invalidations are byte-for-byte unchanged.
// Prefix helpers (`.all`, `.lists()`, `.infinite()`) mirror the prefixes the
// code already used for `invalidateQueries` / `cancelQueries` / `setQueriesData`.

export const issuesKeys = {
  all: ["issues"] as const,
  /** `["issues", <query string or "all">]` — the board list. */
  list: (qs: string) => ["issues", qs || "all"] as const,
  /** `["issues", <jiraKey>]` — a single issue. */
  detail: (jiraKey: string) => ["issues", jiraKey] as const,
  /** `["issues", <jiraKey>, "dependencies"]` — dependency graph for an issue. */
  dependencies: (jiraKey: string) => ["issues", jiraKey, "dependencies"] as const,
  /** `["issues", "filters", <project or "bulk">]`. */
  filters: (scope: string) => ["issues", "filters", scope] as const,
  /** `["issues", <jiraKey>, "versions"]` — available project versions for an issue. */
  versions: (jiraKey: string) => ["issues", jiraKey, "versions"] as const,
  /** `["issues", <jiraKey>, "link-types"]` — issue link types offered by Jira. */
  linkTypes: (jiraKey: string) => ["issues", jiraKey, "link-types"] as const,
  /** `["issues", "search", <query>]` — the lightweight key/summary picker lookup. */
  search: (query: string) => ["issues", "search", query] as const,
  /** `["issues", "release-add", projectKey, version, query, assignee]` */
  releaseAdd: (projectKey: string, version: string, query: string, assignee: string) =>
    ["issues", "release-add", projectKey, version, query, assignee] as const,
  /** `["issue-versions", projectKey]` — cached project versions for quick fix-version picker. */
  versionsByProject: (projectKey: string) => ["issue-versions", projectKey] as const,
};


const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/i;

/**
 * Predicate for `invalidateQueries` that refreshes issue queries touching any of
 * `projects` and leaves other projects' cached board lists alone. Non-list keys
 * (single issues, filters, dependencies...) are always refreshed.
 */
export function issuesTouchingProjects(projects: string[]) {
  const wanted = new Set(projects.map((p) => p.toUpperCase()));
  return (query: { queryKey: readonly unknown[] }): boolean => {
    const key = query.queryKey;
    if (key[0] !== "issues") return false;
    const qs = key[1];
    const isList = key.length === 2 && typeof qs === "string" && !JIRA_KEY_RE.test(qs);
    if (!isList) return true;
    const params = new URLSearchParams(qs === "all" ? "" : qs);
    const scoped = [
      params.get("project"),
      ...(params.get("projectList")?.split(",") ?? []),
    ]
      .map((p) => p?.trim().toUpperCase())
      .filter(Boolean) as string[];
    // No project in the query means "all of the user's projects".
    return scoped.length === 0 || scoped.some((p) => wanted.has(p));
  };
}

export const notificationsKeys = {
  all: ["notifications"] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  /** `["notifications", "list", { limit, unreadOnly, type, cursor }]`. */
  list: (params: {
    limit: number;
    unreadOnly?: boolean;
    type?: string;
    cursor?: string;
  }) => ["notifications", "list", params] as const,
  /** Prefix for `setQueriesData` over every list query. */
  lists: () => ["notifications", "list"] as const,
  /** `["notifications", "infinite", { unreadOnly, type }]`. */
  infinite: (params: { unreadOnly?: boolean; type?: string }) =>
    ["notifications", "infinite", params] as const,
  /** Prefix for `invalidateQueries` over every infinite query. */
  infiniteAll: () => ["notifications", "infinite"] as const,
};

export const projectsKeys = {
  all: ["projects"] as const,
  list: ["projects"] as const,
  peopleFields: (project: string) => ["projects", project, "people-fields"] as const,
  members: (project: string) => ["projects", project, "members"] as const,
};

export const boardKeys = {
  projects: ["projects"] as const,
  statuses: (project: string, boardId?: number | null) =>
    ["board", "statuses", project, boardId ? String(boardId) : "auto"] as const,
  statusesPrefix: (project?: string) =>
    project ? (["board", "statuses", project] as const) : (["board", "statuses"] as const),
  options: (project: string) => ["board", "options", project] as const,
  membershipStatus: (project: string, boardId: number) =>
    ["board", "membership", "status", project, boardId] as const,
  peopleFields: (project: string) => projectsKeys.peopleFields(project),
  members: (project: string) => projectsKeys.members(project),
};


export const meKeys = {
  status: ["me", "status"] as const,
  prefs: ["me", "prefs"] as const,
  integrations: ["me-integrations"] as const,
};

export const chatKeys = {
  identity: ["chat", "identity"] as const,
};

export const watchKeys = {
  all: ["watch"] as const,
};

export const staleKeys = {
  all: ["stale"] as const,
  /** `["stale", project, assignee, status, reason, severity]`. */
  list: (
    project: string,
    assignee: string,
    status: string,
    reason: string,
    severity: string
  ) => ["stale", project, assignee, status, reason, severity] as const,
};

export const freshnessKeys = {
  all: ["freshness"] as const,
};

export const syncKeys = {
  all: ["sync"] as const,
  active: ["sync", "active"] as const,
  status: (projectKey: string) => ["sync", "status", projectKey] as const,
};

export const settingsKeys = {
  users: ["settings", "users"] as const,
  leaderCandidates: ["settings", "leader-candidates"] as const,
};

export const notifyKeys = {
  preferences: ["notify", "preferences"] as const,
};

export const transitionsKeys = {
  /** `["transitions", <jiraKey>]`. */
  forIssue: (jiraKey: string) => ["transitions", jiraKey] as const,
};

export const branchesForKeys = {
  /** `["branches-for", <jiraKey>]`. */
  forIssue: (jiraKey: string) => ["branches-for", jiraKey] as const,
};

export const releasesKeys = {
  all: ["releases"] as const,
  list: (projectKey: string = "all") => ["releases", projectKey] as const,
  permissions: (projectKey: string) => ["release-permissions", projectKey] as const,
  permissionsAll: () => ["release-permissions"] as const,
};

export const leaderboardKeys = {
  all: ["leaderboard"] as const,
  list: (
    timeframe: string,
    year: number,
    month?: number,
    quarter?: number,
    project: string = "ALL"
  ) => ["leaderboard", timeframe, year, month, quarter, project] as const,
};
export const branchesKeys = {
  all: ["branches"] as const,
  /** `["branches", <filters>]`. */
  list: (filters: unknown) => ["branches", filters] as const,
  tasksAll: ["branches-tasks"] as const,
  /** `["branches-tasks", <filters>]`. */
  tasks: (filters: unknown) => ["branches-tasks", filters] as const,
  facets: ["branches-facets"] as const,
  picker: (jiraKey: string, term: string) => ["branches-tasks", "picker", jiraKey, term] as const,
  prPlan: (jiraKey: string) => ["branches-tasks", "pr-plan", jiraKey] as const,
};

export const bulkKeys = {
  /** `["bulk-operations"]`. */
  operations: ["bulk-operations"] as const,
  /** `["bulk-operation", <operationId>]`. */
  operation: (id: string) => ["bulk-operation", id] as const,
  /** `["bulk-operation", <operationId>]`. */
  op: (id: string) => ["bulk-operation", id] as const,
  /** Existing Jira Fix Versions for the selected project scope. */
  versions: (projects: string[]) => ["bulk-versions", [...projects].sort()] as const,
  /** Available editable fields metadata for a project. */
  fields: (project: string) => ["bulk-fields", project] as const,
  /** `["bulk-create-metadata", <projectKey>]`. */
  createMetadata: (projectKey: string) => ["bulk-create-metadata", projectKey] as const,
  /** `["bulk-create-assignees", <projectKey>, <query>]`. */
  createAssignees: (projectKey: string, query: string) =>
    ["bulk-create-assignees", projectKey, query] as const,
  /** `["bulk-create-parents", <projectKey>, <query>]`. */
  createParentIssues: (projectKey: string, query: string) =>
    ["bulk-create-parents", projectKey, query] as const,
  /** `["bulk-create-labels", <projectKey>, <query>]`. */
  createLabels: (projectKey: string, query: string) =>
    ["bulk-create-labels", projectKey, query] as const,
  /** `["bulk-create-template", <projectKey>, <issueKey>]`. */
  createTemplate: (projectKey: string, issueKey: string) =>
    ["bulk-create-template", projectKey, issueKey] as const,
  /** `["bulk-create-template-issues", <projectKey>, <query>]`. */
  createTemplateIssues: (projectKey: string, query: string) =>
    ["bulk-create-template-issues", projectKey, query] as const,
};

function normalizeReportParams(params?: Record<string, unknown>): Record<string, unknown> {
  if (!params) return {};
  const sortedKeys = Object.keys(params).sort();
  const result: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const val = params[k];
    if (val !== undefined && val !== null && val !== "") {
      if (Array.isArray(val)) {
        result[k] = [...val].sort();
      } else {
        result[k] = val;
      }
    }
  }
  return result;
}

export const reportsKeys = {
  all: ["reports"] as const,
  portfolio: (params?: Record<string, unknown>) =>
    ["reports", "portfolio", normalizeReportParams(params)] as const,
  project: (projectKey: string, params?: Record<string, unknown>) =>
    ["reports", "project", projectKey.trim().toUpperCase(), normalizeReportParams(params)] as const,
  risks: (projectKey: string, params?: Record<string, unknown>) =>
    ["reports", "risks", projectKey.trim().toUpperCase(), normalizeReportParams(params)] as const,
  tasks: (projectKey: string, params?: Record<string, unknown>) =>
    ["reports", "tasks", projectKey.trim().toUpperCase(), normalizeReportParams(params)] as const,
  members: (projectKey: string, params?: Record<string, unknown>) =>
    ["reports", "members", projectKey.trim().toUpperCase(), normalizeReportParams(params)] as const,
  history: (projectKey: string, params?: Record<string, unknown>) =>
    ["reports", "history", projectKey.trim().toUpperCase(), normalizeReportParams(params)] as const,
};

/**
 * Predicate for `invalidateQueries` that refreshes report queries of `projects`
 * plus the portfolio (which aggregates every project), leaving other projects'
 * cached project/tasks/members/history reports alone.
 */
export function reportsTouchingProjects(projects: string[]) {
  const wanted = new Set(projects.map((p) => p.trim().toUpperCase()));
  return (query: { queryKey: readonly unknown[] }): boolean => {
    const key = query.queryKey;
    if (key[0] !== "reports") return false;
    if (key[1] === "portfolio") return true;
    const projectKey = key[2];
    return typeof projectKey === "string" ? wanted.has(projectKey.toUpperCase()) : true;
  };
}

export const sentryKeys = {
  all: ["sentry"] as const,
  list: (
    state: string = "review",
    project: string = "all",
    q: string = "",
    sort: string = "",
    filters: string = ""
  ) => ["sentry", "list", state, project, q, sort, filters] as const,
  stats: (project: string = "all") => ["sentry", "stats", project || "all"] as const,
  lists: () => ["sentry", "list"] as const,
  detail: (id: string) => ["sentry", "detail", id] as const,
};

export const adminKeys = {
  all: ["admin"] as const,
  projects: ["admin", "projects"] as const,
  overview: ["admin", "overview"] as const,
  metrics: ["admin", "overview", "metrics"] as const,
  audit: ["admin", "overview", "audit"] as const,
  health: ["admin", "overview", "health"] as const,
  overviewErrors: (type: "sentry" | "outbox") => ["admin", "overview", "errors", type] as const,
  activity: (filters?: Record<string, unknown>) => ["admin", "activity", filters ?? {}] as const,
};

