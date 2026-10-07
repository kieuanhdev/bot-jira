/**
 * Canonical Issue Filter Model & Helpers.
 *
 * Implements the shared filter state model across Board, Bulk, and Stale
 * per docs/JIRA_SHARED_ISSUE_FILTER_ASSIGNEE_UX_PLAN.md.
 */

export type AssigneeToken = "me" | "unassigned" | string;

export type AssigneeScope = {
  mode: "all" | "roster";
  roster: AssigneeToken[];
  view: "all-selected" | AssigneeToken;
};

export type IssueFilters = {
  project: string;
  query: string;
  assigneeScope: AssigneeScope;
  statuses: string[];
  labels: string[];
  priorities: string[];
  epics: string[];
  roles: string[];
  reporters: string[];
  approvers: string[];
  testers: string[];
  types: string[];
  fixVersions: string[];
  overdue: boolean;
  includeDone: boolean;
};

type ArrayFacet = "statuses" | "labels" | "priorities" | "epics" | "roles" |
  "reporters" | "approvers" | "testers" | "types" | "fixVersions";

const ARRAY_FACETS: Array<{ key: ArrayFacet; param: string; aliases?: string[] }> = [
  { key: "statuses", param: "status", aliases: ["statuses"] },
  { key: "labels", param: "label", aliases: ["labels"] },
  { key: "priorities", param: "priority", aliases: ["priorities"] },
  { key: "epics", param: "epic", aliases: ["epics"] },
  { key: "roles", param: "role", aliases: ["roles"] },
  { key: "reporters", param: "reporter" },
  { key: "approvers", param: "approver" },
  { key: "testers", param: "tester" },
  { key: "types", param: "type", aliases: ["types"] },
  { key: "fixVersions", param: "fixVersion", aliases: ["fixVersions"] },
];

export const DEFAULT_BOARD_FILTERS: IssueFilters = {
  project: "",
  query: "",
  assigneeScope: {
    mode: "roster",
    roster: ["me"],
    view: "all-selected",
  },
  statuses: [],
  labels: [],
  priorities: [],
  epics: [],
  roles: [], reporters: [], approvers: [], testers: [], types: [], fixVersions: [],
  overdue: false,
  includeDone: true,
};

export const DEFAULT_BULK_FILTERS: IssueFilters = {
  project: "",
  query: "",
  assigneeScope: {
    mode: "all",
    roster: [],
    view: "all-selected",
  },
  statuses: [],
  labels: [],
  priorities: [],
  epics: [],
  roles: [], reporters: [], approvers: [], testers: [], types: [], fixVersions: [],
  overdue: false,
  includeDone: true,
};

/**
 * Deduplicate tokens case-insensitively while preserving canonical casing:
 * "me" and "unassigned" always lowercase; usernames trimmed.
 * If user's own username is provided, removes duplicate "me" / username.
 */
export function normalizeAssigneeToken(
  token: string,
  myUsername?: string | null
): AssigneeToken {
  const trimmed = token.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "me" || (myUsername && lower === myUsername.toLowerCase())) {
    return "me";
  }
  if (lower === "unassigned" || lower === "none") {
    return "unassigned";
  }
  return trimmed;
}

export function normalizeAssigneeScope(
  scope: AssigneeScope,
  myUsername?: string | null
): AssigneeScope {
  if (scope.mode === "all") {
    return {
      mode: "all",
      roster: [],
      view: "all-selected",
    };
  }

  const seen = new Set<string>();
  const normalizedRoster: AssigneeToken[] = [];

  for (const raw of scope.roster) {
    const token = normalizeAssigneeToken(raw, myUsername);
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalizedRoster.push(token);
    }
  }

  if (normalizedRoster.length === 0) {
    return {
      mode: "all",
      roster: [],
      view: "all-selected",
    };
  }

  let view: "all-selected" | AssigneeToken = "all-selected";
  if (scope.view !== "all-selected") {
    const normView = normalizeAssigneeToken(scope.view, myUsername);
    const viewMatch = normalizedRoster.find(
      (r) => r.toLowerCase() === normView.toLowerCase()
    );
    view = viewMatch ?? "all-selected";
  }

  return {
    mode: "roster",
    roster: normalizedRoster,
    view,
  };
}

function normalizeStringArray(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr) {
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      out.push(trimmed);
    }
  }
  return out;
}

export function normalizeIssueFilters(
  input: IssueFilters,
  myUsername?: string | null
): IssueFilters {
  return {
    project: input.project.trim().toUpperCase(),
    query: input.query.trim(),
    assigneeScope: normalizeAssigneeScope(input.assigneeScope, myUsername),
    ...Object.fromEntries(ARRAY_FACETS.map(({ key }) => [key, normalizeStringArray(input[key] ?? [])])) as Pick<IssueFilters, ArrayFacet>,
    overdue: Boolean(input.overdue),
    includeDone: Boolean(input.includeDone),
  };
}

/**
 * Returns effective assignees to pass to issues API query:
 * - "ALL" when mode is "all"
 * - [view] when viewing a single roster member
 * - roster array when viewing all-selected
 */
export function effectiveAssignees(scope: AssigneeScope): "ALL" | string[] {
  if (scope.mode === "all") return "ALL";
  if (scope.view === "all-selected") {
    return scope.roster.length > 0 ? scope.roster : "ALL";
  }
  return [scope.view];
}

/**
 * Counts how many filter dimensions differ from the page defaults.
 */
export function countActiveIssueFilters(
  value: IssueFilters,
  defaults: IssueFilters
): number {
  let count = 0;

  if (value.query.trim() && value.query.trim() !== defaults.query.trim()) {
    count++;
  }

  // Assignee comparison
  const valScope = value.assigneeScope;
  const defScope = defaults.assigneeScope;
  const sameMode = valScope.mode === defScope.mode;
  const sameView = valScope.view === defScope.view;
  const valRoster = [...valScope.roster].sort().join(",").toLowerCase();
  const defRoster = [...defScope.roster].sort().join(",").toLowerCase();
  if (!sameMode || !sameView || valRoster !== defRoster) {
    count++;
  }

  for (const { key } of ARRAY_FACETS) {
    const current = value[key] ?? [];
    const baseline = defaults[key] ?? [];
    if (current.length > 0 && current.slice().sort().join(",") !== baseline.slice().sort().join(",")) {
      count += current.length;
    }
  }

  if (value.overdue !== defaults.overdue) count++;

  if (value.includeDone !== defaults.includeDone) {
    count++;
  }

  return count;
}

/**
 * Serializes filters to URLSearchParams. Omits parameters that match defaults.
 */
export function serializeIssueFilters(
  value: IssueFilters,
  defaults: IssueFilters = DEFAULT_BOARD_FILTERS
): URLSearchParams {
  const params = new URLSearchParams();

  if (value.project && value.project !== defaults.project) {
    params.set("project", value.project);
  }

  if (value.query.trim() && value.query.trim() !== defaults.query.trim()) {
    params.set("q", value.query.trim());
  }

  // Assignee serialization
  const valScope = value.assigneeScope;
  const defScope = defaults.assigneeScope;
  const isAssigneeDefault =
    valScope.mode === defScope.mode &&
    valScope.view === defScope.view &&
    [...valScope.roster].sort().join(",") === [...defScope.roster].sort().join(",");

  if (!isAssigneeDefault) {
    if (valScope.mode === "all") {
      params.set("assignee", "ALL");
    } else {
      params.set("assignee", [...valScope.roster].sort().join(","));
      if (valScope.view !== "all-selected") {
        params.set("assigneeView", valScope.view);
      }
    }
  }

  for (const { key, param } of ARRAY_FACETS) {
    const current = value[key] ?? [];
    const baseline = defaults[key] ?? [];
    if (current.length > 0 && current.slice().sort().join(",") !== baseline.slice().sort().join(",")) {
      params.set(param, [...current].sort().join(","));
    }
  }

  if (value.overdue !== defaults.overdue) params.set("overdue", value.overdue ? "1" : "0");

  if (value.includeDone !== defaults.includeDone) {
    params.set("includeDone", value.includeDone ? "1" : "0");
  }

  return params;
}

/**
 * Parses URLSearchParams into canonical IssueFilters safely falling back to defaults.
 */
export function parseIssueFilters(
  params: URLSearchParams,
  defaults: IssueFilters = DEFAULT_BOARD_FILTERS,
  myUsername?: string | null
): IssueFilters {
  const project = params.get("project")?.trim().toUpperCase() || defaults.project;
  const query = params.get("q") ?? params.get("query") ?? defaults.query;

  // Assignee
  const rawAssignees = params.get("assignee") ?? params.get("assignees");
  let assigneeScope: AssigneeScope;

  if (rawAssignees !== null) {
    const rawTokens = rawAssignees
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawTokens.length === 0 || rawTokens.some((t) => t.toUpperCase() === "ALL")) {
      assigneeScope = {
        mode: "all",
        roster: [],
        view: "all-selected",
      };
    } else {
      const roster: AssigneeToken[] = rawTokens.map((t) =>
        normalizeAssigneeToken(t, myUsername)
      );
      const rawView = params.get("assigneeView")?.trim();
      const view =
        rawView && rawView !== "all-selected"
          ? normalizeAssigneeToken(rawView, myUsername)
          : "all-selected";

      assigneeScope = normalizeAssigneeScope(
        {
          mode: "roster",
          roster,
          view,
        },
        myUsername
      );
    }
  } else {
    assigneeScope = defaults.assigneeScope;
  }

  const facetValues = Object.fromEntries(ARRAY_FACETS.map(({ key, param, aliases = [] }) => {
    const raw = [param, ...aliases].map((name) => params.get(name)).find((item) => item !== null);
    return [key, raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : defaults[key] ?? []];
  })) as Pick<IssueFilters, ArrayFacet>;

  // includeDone
  const rawDone = params.get("includeDone");
  const includeDone =
    rawDone === "1" ? true : rawDone === "0" ? false : defaults.includeDone;

  return normalizeIssueFilters(
    {
      project,
      query,
      assigneeScope,
      ...facetValues,
      overdue: params.get("overdue") === "1" ? true : params.get("overdue") === "0" ? false : defaults.overdue,
      includeDone,
    },
    myUsername
  );
}
