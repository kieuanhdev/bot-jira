import { env } from "@/lib/env";
import type {
  JiraIssue,
  JiraSearchResult,
  JiraTransition,
  JiraComment,
  JiraProject,
  JiraUser,
  JiraProjectStatus,
  JiraCommentPage,
  JiraVersion,
} from "./types";

const BASE_ISSUE_FIELDS = [
  "project",
  "summary",
  "description",
  "status",
  "statuscategorychangedate",
  "assignee",
  "labels",
  "fixVersions",
  "priority",
  "issuetype",
  "issuelinks",
  "created",
  "updated",
  "duedate",
  "timespent",
];

export function jiraIssueFields(): string {
  return [...BASE_ISSUE_FIELDS, env.jiraPointsFieldId].filter(Boolean).join(",");
}

export class JiraRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "JiraRequestError";
  }
}

/** Normalize a Jira date (ISO, often with a +0000 offset) to a Date. */
export function parseJiraDate(s?: string | null): Date | undefined {
  if (!s) return undefined;
  // "2024-01-01T10:00:00.000+0000" -> "2024-01-01T10:00:00.000+00:00"
  const iso = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Auth material for a single Jira caller. */
export type JiraAuth = {
  user: string;
  token: string;
  /** "Bearer" or "basic". */
  authMode: "Bearer" | "basic";
};

const systemAuth: JiraAuth = {
  user: env.jiraUser,
  token: env.jiraToken,
  authMode: (env.jiraAuth || "Bearer").toLowerCase() === "basic" ? "basic" : "Bearer",
};

function authHeader(a: JiraAuth): string {
  return a.authMode === "basic"
    ? `Basic ${Buffer.from(`${a.user}:${a.token}`).toString("base64")}`
    : `Bearer ${a.token}`;
}

/**
 * Probe /myself with both auth styles and report which one this Jira accepts.
 * Used on credential save so we store the mode that actually works — the user
 * doesn't have to guess Bearer vs Basic.
 */
export async function detectJiraAuth(
  token: string,
  username: string
): Promise<{
  mode: "Bearer" | "basic";
  name?: string;
  key?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
  jiraIdentityKey?: string;
} | null> {
  const { computeJiraIdentityKey } = await import("./auth-service");
  const base = env.jiraBaseUrl.replace(/\/$/, "");
  const candidates: JiraAuth[] = [
    { user: username, token, authMode: "Bearer" },
    ...(username ? [{ user: username, token, authMode: "basic" as const }] : []),
  ];
  for (const a of candidates) {
    try {
      const res = await fetch(`${base}/rest/api/2/myself`, {
        headers: { Accept: "application/json", Authorization: authHeader(a) },
      });
      if (res.ok) {
        const me = (await res.json()) as JiraUser;
        const identityKey = computeJiraIdentityKey(me);
        return {
          mode: a.authMode,
          name: me.name || me.displayName,
          key: me.key,
          displayName: me.displayName,
          emailAddress: me.emailAddress,
          active: me.active,
          jiraIdentityKey: identityKey ?? undefined,
        };
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Check whether a user's Jira credential actually authenticates. Missing auth
 * is always rejected; user-initiated work must never fall back to system auth.
 */
export async function probeJiraAuth(userAuth: JiraAuth | null): Promise<boolean> {
  if (!userAuth) return false;
  try {
    const base = env.jiraBaseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/rest/api/2/myself`, {
      headers: { Accept: "application/json", Authorization: authHeader(userAuth) },
      signal: AbortSignal.timeout(env.jiraRequestTimeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth: JiraAuth
): Promise<T> {
  const url = env.jiraBaseUrl.replace(/\/$/, "") + path;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.jiraRequestTimeoutMs);
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader(auth),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      // Upstream response bodies can contain internal HTML, user content or
      // diagnostics. Keep the error useful without reflecting that data.
      throw new JiraRequestError(
        `Jira ${init.method ?? "GET"} ${path.split("?")[0]} -> ${res.status}`,
        res.status,
        res.status === 408 || res.status === 429 || res.status >= 500
      );
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new JiraRequestError(
        `Jira ${init.method ?? "GET"} ${path.split("?")[0]} -> timeout`,
        null,
        true
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }
}

/**
 * Build a scoped Jira client that always uses the explicitly supplied auth.
 * User-facing code must pass the current user's credential. The exported
 * `jira` singleton below is reserved for background synchronization/system work.
 */
export function jiraWith(auth: JiraAuth) {
  return {
    me: () => request<JiraUser>("/rest/api/2/myself", {}, auth),
    search: (jql: string, maxResults = 50, startAt = 0) => {
      const params = new URLSearchParams({
        jql,
        fields: jiraIssueFields(),
        maxResults: String(maxResults),
        startAt: String(startAt),
      });
      return request<JiraSearchResult>(`/rest/api/2/search?${params}`, {}, auth);
    },
    getIssue: (key: string, extraFields?: string) => {
      const fields = new URLSearchParams();
      if (extraFields) fields.set("fields", extraFields);
      const qs = fields.toString();
      return request<JiraIssue>(`/rest/api/2/issue/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`, {}, auth);
    },
    getCommentsPage: (key: string, startAt = 0, maxResults = 100) =>
      request<JiraCommentPage>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/comment?orderBy=created&startAt=${startAt}&maxResults=${maxResults}`,
        {},
        auth
      ),
    getComments: async (key: string) => {
      const out: JiraComment[] = [];
      const pageSize = 100;
      for (let page = 0; page < 100; page++) {
        const startAt = page * pageSize;
        const res = await request<JiraCommentPage>(
          `/rest/api/2/issue/${encodeURIComponent(key)}/comment?orderBy=created&startAt=${startAt}&maxResults=${pageSize}`,
          {},
          auth
        );
        const rows = res.comments ?? res.issues ?? [];
        out.push(...rows);
        const total = res.total ?? rows.length;
        if (rows.length < pageSize || startAt + rows.length >= total) break;
      }
      return out;
    },
    getTransitions: async (key: string) => {
      const res = await request<{ transitions: JiraTransition[] }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`,
        {},
        auth
      );
      return res.transitions;
    },
    transition: (key: string, transitionId: string, fields?: Record<string, unknown>) =>
      request(
        `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`,
        { method: "POST", body: JSON.stringify({ transition: { id: transitionId }, fields }) },
        auth
      ),
    findTransition: async (key: string, targetStatus: string) => {
      const transitions = await request<{ transitions: JiraTransition[] }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`,
        {},
        auth
      );
      const target = targetStatus.toLowerCase();
      return (
        transitions.transitions.find((t) => t.to?.name?.toLowerCase() === target) ?? null
      );
    },
    /**
     * Resolve a version name to a Fix Version id for a project. Returns null if
     * the version does not exist. Used by bulk fix-version actions to add or
     * remove a version by name.
     */
    resolveVersionId: async (projectKey: string, name: string): Promise<string | null> => {
      const versions = await request<JiraVersion[]>(
        `/rest/api/2/project/${encodeURIComponent(projectKey)}/versions`,
        {},
        auth
      );
      const match = versions.find(
        (v) => v.name.toLowerCase() === name.toLowerCase()
      );
      return match?.id ?? null;
    },
    updateIssue: (
      key: string,
      patch: {
        summary?: string;
        description?: string;
        assignee?: string | null;
        labels?: string[];
        priority?: string;
        points?: number | null;
        fixVersions?: string[];
      }
    ) => {
      const fields: Record<string, unknown> = {};
      if (patch.summary !== undefined) fields.summary = patch.summary;
      if (patch.description !== undefined) fields.description = patch.description;
      if (patch.assignee !== undefined)
        fields.assignee = patch.assignee === null ? null : { name: patch.assignee };
      if (patch.labels !== undefined) fields.labels = patch.labels;
      if (patch.priority !== undefined) fields.priority = { name: patch.priority };
      if (patch.points !== undefined && env.jiraPointsFieldId) {
        fields[env.jiraPointsFieldId] = patch.points;
      }
      if (patch.fixVersions !== undefined)
        fields.fixVersions = patch.fixVersions.map((id) => ({ id }));
      if (Object.keys(fields).length === 0) return undefined as unknown as void;
      return request(`/rest/api/2/issue/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ fields }),
      }, auth);
    },
    createIssue: (data: {
      projectKey: string;
      summary: string;
      description?: string;
      issueType?: string;
      assignee?: string;
      labels?: string[];
      priority?: string;
    }) => {
      const fields: Record<string, unknown> = {
        summary: data.summary,
        description: data.description,
        issuetype: { name: data.issueType ?? "Bug" },
        labels: data.labels ?? [],
      };
      if (data.assignee) fields.assignee = { name: data.assignee };
      if (data.priority) fields.priority = { name: data.priority };
      return request<{ key: string; id: string; self: string }>(
        "/rest/api/2/issue",
        {
          method: "POST",
          body: JSON.stringify({
            project: { key: data.projectKey },
            fields,
          }),
        },
        auth
      );
    },
    getProjects: () => request<JiraProject[]>("/rest/api/2/project", {}, auth),
    /**
     * The project's workflow: each issue type with its statuses in workflow
     * order (the order an issue moves through them). Backed by Jira REST v2
     * `/project/{key}/statuses` (v3 is not available on this DC instance).
     */
    getProjectStatuses: (projectKey: string) =>
      request<JiraProjectStatus[]>(`/rest/api/2/project/${encodeURIComponent(projectKey)}/statuses`, {}, auth),
    addComment: (key: string, body: string) =>
      request(
        `/rest/api/2/issue/${encodeURIComponent(key)}/comment`,
        { method: "POST", body: JSON.stringify({ body }) },
        auth
      ),
    /** List the Fix Versions (release versions) of a project. */
    getVersions: (projectKey: string) =>
      request<JiraVersion[]>(
        `/rest/api/2/project/${encodeURIComponent(projectKey)}/versions`,
        {},
        auth
      ),
    /** Create a new Fix Version on a project. */
    createVersion: (projectKey: string, name: string, description?: string) =>
      request<JiraVersion>(
        "/rest/api/2/version",
        {
          method: "POST",
          body: JSON.stringify({ name, description, project: projectKey }),
        },
        auth
      ),
    /** Update an existing Fix Version (name/description/release date). */
    updateVersion: (
      versionId: string,
      data: { name?: string; description?: string; releaseDate?: string | null }
    ) =>
      request<JiraVersion>(`/rest/api/2/version/${encodeURIComponent(versionId)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }, auth),
    /** Mark a Fix Version as released with a release date. */
    releaseVersion: (versionId: string) =>
      request<JiraVersion>(`/rest/api/2/version/${encodeURIComponent(versionId)}`, {
        method: "PUT",
        body: JSON.stringify({
          released: true,
          releaseDate: new Date().toISOString().slice(0, 10),
        }),
      }, auth),
  };
}

// System-only client for workers, webhooks and health checks that maintain the
// shared read model. Never use this client for an end-user initiated action.
export const jira = jiraWith(systemAuth);
