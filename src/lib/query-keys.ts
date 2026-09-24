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
  /** `["issues", "filters", <project or "bulk">]`. */
  filters: (scope: string) => ["issues", "filters", scope] as const,
};

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

export const boardKeys = {
  projects: ["projects"] as const,
  statuses: (project: string) => ["board", "statuses", project] as const,
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

export const settingsKeys = {
  users: ["settings", "users"] as const,
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
};

export const branchesKeys = {
  /** `["branches", <filters>]`. */
  list: (filters: unknown) => ["branches", filters] as const,
  /** `["branches-tasks", <filters>]`. */
  tasks: (filters: unknown) => ["branches-tasks", filters] as const,
  facets: ["branches-facets"] as const,
};

export const bulkKeys = {
  /** `["bulk-op", <operationId>]`. */
  op: (id: string) => ["bulk-op", id] as const,
};
