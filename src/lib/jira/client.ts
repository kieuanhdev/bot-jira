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
  JiraFieldDefinition,
  JiraEditMeta,
  JiraWorklog,
  JiraMyPermissions,
  JiraCreateMetaResponse,
  JiraCreateMetaField,
  JiraCreateMetaIssueTypesResponse,
  JiraCreateMetaFieldsResponse,
  CreateIssueInput,
  CreateIssueResult,
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
  "timeoriginalestimate",
  "timeestimate",
  "timetracking",
  "comment",
];

const POINT_FIELD_NAMES = new Set(["story points", "task points"]);
let knownPointFields: JiraFieldDefinition[] = [];

function isPointField(field: Pick<JiraFieldDefinition, "name" | "schema">): boolean {
  return POINT_FIELD_NAMES.has(field.name.trim().toLowerCase()) && field.schema?.type === "number";
}

function configuredPointField(): JiraFieldDefinition[] {
  return env.jiraPointsFieldId
    ? [{ id: env.jiraPointsFieldId, name: "Configured points", custom: true, schema: { type: "number" } }]
    : [];
}

function rememberPointFields(fields: JiraFieldDefinition[]): JiraFieldDefinition[] {
  knownPointFields = fields.filter(isPointField);
  return knownPointFields;
}

function knownPointFieldIds(): string[] {
  return [...configuredPointField(), ...knownPointFields].map((field) => field.id);
}

export function jiraIssueFields(): string {
  return [...BASE_ISSUE_FIELDS, ...knownPointFieldIds()]
    .filter(Boolean)
    .filter((field, index, fields) => fields.indexOf(field) === index)
    .join(",");
}

/** Extract the active points value and field id from a Jira issue payload. */
export function jiraPointsFromFields(fields: Record<string, unknown>): {
  points: number | null;
  fieldId: string | null;
} {
  const candidates = [...configuredPointField(), ...knownPointFields].filter(
    (field, index, all) => all.findIndex((candidate) => candidate.id === field.id) === index
  );
  for (const field of candidates) {
    const raw = fields[field.id];
    if (raw != null && Number.isFinite(Number(raw))) {
      return { points: Number(raw), fieldId: field.id };
    }
  }
  return { points: null, fieldId: candidates[0]?.id ?? null };
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

/**
 * Check whether the user's Jira permissions grant rights to create/administer Fix Versions in a project.
 * Jira project versions can be created by users with ADMINISTER_PROJECTS permission on the project,
 * or global Jira administrators (ADMINISTER or SYSTEM_ADMIN).
 */
export function canCreateProjectVersion(response?: JiraMyPermissions | null): boolean {
  if (!response || typeof response !== "object" || !response.permissions) {
    return false;
  }
  const perms = response.permissions;
  return Boolean(
    perms.ADMINISTER_PROJECTS?.havePermission ||
    perms.MANAGE_VERSIONS?.havePermission ||
    perms.PROJECT_ADMIN?.havePermission ||
    perms.ADMINISTER?.havePermission ||
    perms.SYSTEM_ADMIN?.havePermission
  );
}

/** Auth material for a single Jira caller. */
export type JiraAuth = {
  user: string;
  token: string;
  /** "Bearer" or "basic". */
  authMode: "Bearer" | "basic";
};

export async function getSystemJiraAuth(): Promise<JiraAuth | null> {
  if (env.jiraToken) {
    return {
      user: env.jiraUser,
      token: env.jiraToken,
      authMode: (env.jiraAuth || "Bearer").toLowerCase() === "basic" ? "basic" : "Bearer",
    };
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const { safeDecrypt } = await import("@/lib/crypto");
    const user = await prisma.user.findFirst({
      where: { jiraTokenEnc: { not: null } },
      orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
    });
    if (user?.jiraTokenEnc) {
      const token = safeDecrypt(user.jiraTokenEnc);
      if (token) {
        const username = user.jiraUsername || safeDecrypt(user.jiraUserEnc) || "";
        const authMode = (user.jiraAuth || "Bearer").toLowerCase() === "basic" ? "basic" : "Bearer";
        return { user: username, token, authMode };
      }
    }
  } catch {
    // Database may not be connected yet
  }
  return null;
}

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

async function requestOnce<T>(
  path: string,
  init: RequestInit = {},
  auth?: JiraAuth
): Promise<T> {
  let effectiveAuth = auth;
  if (!effectiveAuth || !effectiveAuth.token) {
    const sys = await getSystemJiraAuth();
    if (sys) effectiveAuth = sys;
  }
  if (!effectiveAuth || !effectiveAuth.token) {
    throw new JiraRequestError(
      "Chưa cấu hình tài khoản Jira trong hệ thống hoặc thiết lập người dùng",
      401,
      false
    );
  }
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
        Authorization: authHeader(effectiveAuth),
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

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 2000;

/**
 * Jira HTTP request with automatic retry for retryable errors (timeouts,
 * 429 rate-limit, 5xx server errors). Retries up to MAX_RETRIES times with
 * exponential backoff (2s → 4s) to absorb transient Jira slowdowns without
 * failing entire poll-jira jobs.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  auth?: JiraAuth
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestOnce<T>(path, init, auth);
    } catch (error) {
      lastError = error;
      const isRetryable = error instanceof JiraRequestError && error.retryable;
      if (!isRetryable || attempt >= MAX_RETRIES) break;
      const delayMs = RETRY_BASE_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/**
 * Build a scoped Jira client that uses the explicitly supplied auth,
 * or dynamically falls back to the system/configured user auth.
 */
export function jiraWith(auth?: JiraAuth) {
  let pointFieldsPromise: Promise<JiraFieldDefinition[]> | null = null;
  const getPointFields = async (): Promise<JiraFieldDefinition[]> => {
    if (knownPointFields.length > 0) return knownPointFields;
    if (!pointFieldsPromise) {
      pointFieldsPromise = request<JiraFieldDefinition[]>("/rest/api/2/field", {}, auth)
        .then(rememberPointFields)
        .catch((error) => {
          pointFieldsPromise = null;
          if (env.jiraPointsFieldId) return configuredPointField();
          throw error;
        });
    }
    return pointFieldsPromise;
  };

  return {
    me: () => request<JiraUser>("/rest/api/2/myself", {}, auth),
    search: async (jql: string, maxResults = 50, startAt = 0) => {
      await getPointFields().catch(() => configuredPointField());
      const params = new URLSearchParams({
        jql,
        fields: jiraIssueFields(),
        maxResults: String(maxResults),
        startAt: String(startAt),
      });
      return request<JiraSearchResult>(`/rest/api/2/search?${params}`, {}, auth);
    },
    getIssue: async (key: string, extraFields?: string) => {
      const fields = new URLSearchParams();
      if (extraFields) {
        await getPointFields().catch(() => configuredPointField());
        const requested = [...extraFields.split(","), ...knownPointFieldIds()]
          .filter(Boolean)
          .filter((field, index, all) => all.indexOf(field) === index);
        fields.set("fields", requested.join(","));
      }
      const qs = fields.toString();
      return request<JiraIssue>(`/rest/api/2/issue/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`, {}, auth);
    },
    getEditMeta: (key: string) =>
      request<JiraEditMeta>(`/rest/api/2/issue/${encodeURIComponent(key)}/editmeta`, {}, auth),
    getFields: getPointFields,
    resolvePointsField: async (key: string): Promise<JiraFieldDefinition | null> => {
      const meta = await request<JiraEditMeta>(`/rest/api/2/issue/${encodeURIComponent(key)}/editmeta`, {}, auth);
      const editable = Object.entries(meta.fields ?? {})
        .map(([id, field]) => ({ id, name: field.name, schema: field.schema }))
        .filter(isPointField);
      return editable.find((field) => field.id === env.jiraPointsFieldId) ?? editable[0] ?? null;
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
    updateIssue: async (
      key: string,
      patch: {
        summary?: string;
        description?: string;
        assignee?: string | null;
        labels?: string[];
        priority?: string;
        points?: number | null;
        fixVersions?: string[];
        dueDate?: string | null;
        originalEstimate?: string;
      }
    ) => {
      const fields: Record<string, unknown> = {};
      if (patch.summary !== undefined) fields.summary = patch.summary;
      if (patch.description !== undefined) fields.description = patch.description;
      if (patch.assignee !== undefined)
        fields.assignee = patch.assignee === null ? null : { name: patch.assignee };
      if (patch.labels !== undefined) fields.labels = patch.labels;
      if (patch.priority !== undefined) fields.priority = { name: patch.priority };
      if (patch.points !== undefined) {
        const pointField = await (async () => {
          const meta = await request<JiraEditMeta>(
            `/rest/api/2/issue/${encodeURIComponent(key)}/editmeta`,
            {},
            auth
          );
          const editable = Object.entries(meta.fields ?? {})
            .map(([id, field]) => ({ id, name: field.name, schema: field.schema }))
            .filter(isPointField);
          return editable.find((field) => field.id === env.jiraPointsFieldId) ?? editable[0] ?? null;
        })();
        if (!pointField) {
          throw new JiraRequestError("Jira issue has no editable Story Points/Task Points field", 400, false);
        }
        fields[pointField.id] = patch.points;
      }
      if (patch.fixVersions !== undefined)
        fields.fixVersions = patch.fixVersions.map((id) => ({ id }));
      if (patch.dueDate !== undefined) fields.duedate = patch.dueDate;
      if (patch.originalEstimate !== undefined) {
        fields.timetracking = { originalEstimate: patch.originalEstimate };
      }
      if (Object.keys(fields).length === 0) return undefined as unknown as void;
      return request(`/rest/api/2/issue/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ fields }),
      }, auth);
    },
    addWorklog: (
      key: string,
      data: { timeSpent: string; started?: string; comment?: string },
      adjustEstimate: "auto" | "leave" = "leave"
    ): Promise<JiraWorklog> =>
      requestOnce<JiraWorklog>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/worklog?adjustEstimate=${adjustEstimate}`,
        {
          method: "POST",
          body: JSON.stringify({
            timeSpent: data.timeSpent,
            ...(data.started ? { started: data.started } : {}),
            ...(data.comment ? { comment: data.comment } : {}),
          }),
        },
        auth
      ),
    getWorklogs: (
      key: string
    ): Promise<{ startAt?: number; maxResults?: number; total?: number; worklogs?: JiraWorklog[] }> =>
      request(
        `/rest/api/2/issue/${encodeURIComponent(key)}/worklog`,
        { method: "GET" },
        auth
      ),
    createIssue: (data: CreateIssueInput) => {
      const issueFields: Record<string, unknown> = {
        project: { key: data.projectKey },
        summary: data.summary,
        issuetype: data.issueTypeId ? { id: data.issueTypeId } : { name: data.issueType ?? "Bug" },
        ...(data.fields ?? {}),
      };
      if (data.description !== undefined) {
        issueFields.description = data.description;
      }
      if (data.assignee !== undefined) {
        issueFields.assignee = data.assignee ? { name: data.assignee } : null;
      }
      if (data.priorityId) {
        issueFields.priority = { id: data.priorityId };
      } else if (data.priority) {
        issueFields.priority = { name: data.priority };
      }

      const labels = new Set<string>(data.labels ?? []);
      if (data.idempotencyMarker) {
        labels.add(data.idempotencyMarker);
      }
      if (labels.size > 0 || data.labels !== undefined || data.idempotencyMarker) {
        issueFields.labels = Array.from(labels);
      }

      return request<CreateIssueResult>(
        "/rest/api/2/issue",
        {
          method: "POST",
          body: JSON.stringify({
            fields: issueFields,
          }),
        },
        auth
      );
    },
    getCreateMetaIssueTypes: (
      projectKey: string
    ): Promise<JiraCreateMetaIssueTypesResponse> =>
      request<JiraCreateMetaIssueTypesResponse>(
        `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`,
        {},
        auth
      ),
    getCreateMetaFields: (
      projectKey: string,
      issueTypeId: string
    ): Promise<JiraCreateMetaFieldsResponse> =>
      request<JiraCreateMetaFieldsResponse>(
        `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`,
        {},
        auth
      ),
    getCreateMetadata: async (
      projectKey: string,
      issueTypeId?: string
    ): Promise<JiraCreateMetaResponse> => {
      try {
        let url = `/rest/api/2/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`;
        if (issueTypeId) {
          url += `&issuetypeIds=${encodeURIComponent(issueTypeId)}`;
        }
        return await request<JiraCreateMetaResponse>(url, {}, auth);
      } catch (err: unknown) {
        if ((err as JiraRequestError)?.status !== 404) {
          throw err;
        }
        // Jira 9.0+ removed the monolithic createmeta endpoint. Fallback to subresource endpoints.
        const project = await request<JiraProject>(
          `/rest/api/2/project/${encodeURIComponent(projectKey)}`,
          {},
          auth
        );
        const typesRes = await request<JiraCreateMetaIssueTypesResponse>(
          `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`,
          {},
          auth
        );
        const filteredTypes = issueTypeId
          ? (typesRes.values || []).filter((t) => t.id === issueTypeId)
          : typesRes.values || [];

        const issueTypesWithFields = await Promise.all(
          filteredTypes.map(async (t) => {
            try {
              const fieldsRes = await request<JiraCreateMetaFieldsResponse>(
                `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(t.id)}`,
                {},
                auth
              );
              const fieldsRecord: Record<string, JiraCreateMetaField> = {};
              for (const f of fieldsRes.values || []) {
                const id = f.fieldId || (f as any).key || (f as any).id;
                if (id) {
                  fieldsRecord[id] = f;
                }
              }
              return {
                ...t,
                fields: fieldsRecord,
              };
            } catch {
              return {
                ...t,
                fields: {},
              };
            }
          })
        );

        return {
          projects: [
            {
              id: project.id || "",
              key: project.key,
              name: project.name,
              issuetypes: issueTypesWithFields,
            },
          ],
        };
      }
    },
    findIssueByBulkMarker: async (
      projectKey: string,
      marker: string
    ): Promise<JiraIssue | null> => {
      const jql = `project = "${projectKey.replace(/"/g, '\\"')}" AND labels = "${marker.replace(/"/g, '\\"')}"`;
      const res = await request<JiraSearchResult>(
        `/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=5&fields=id,key,summary,status`,
        {},
        auth
      );
      if (!res.issues || res.issues.length === 0) return null;
      if (res.issues.length > 1) {
        throw new JiraRequestError(
          `Tìm thấy nhiều hơn một issue cho marker ${marker}`,
          409,
          false
        );
      }
      return res.issues[0];
    },
    getProjects: () => request<JiraProject[]>("/rest/api/2/project", {}, auth),
    getProject: (projectKey: string) =>
      request<JiraProject>(`/rest/api/2/project/${encodeURIComponent(projectKey)}`, {}, auth),
    /**
     * The project's workflow: each issue type with its statuses in workflow
     * order (the order an issue moves through them). Backed by Jira REST v2
     * `/project/{key}/statuses` (v3 is not available on this DC instance).
     */
    getProjectStatuses: (projectKey: string) =>
      request<JiraProjectStatus[]>(`/rest/api/2/project/${encodeURIComponent(projectKey)}/statuses`, {}, auth),
    addComment: (key: string, body: string) =>
      request<JiraComment>(
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
    /** Get a single Fix Version by ID. */
    getVersion: (versionId: string) =>
      request<JiraVersion>(`/rest/api/2/version/${encodeURIComponent(versionId)}`, {}, auth),
    /**
     * Query effective permissions of the authenticated user for a specific project.
     * Backed by Jira REST v2 `GET /rest/api/2/mypermissions?projectKey={key}`.
     * Throws 401 if personal token is missing to prevent fallback to system auth.
     */
    getMyPermissions: async (projectKey: string): Promise<JiraMyPermissions> => {
      if (!auth?.token) {
        throw new JiraRequestError(
          "Yêu cầu token Jira cá nhân để kiểm tra quyền dự án",
          401,
          false
        );
      }
      return request<JiraMyPermissions>(
        `/rest/api/2/mypermissions?projectKey=${encodeURIComponent(projectKey)}`,
        {},
        auth
      );
    },
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

// System client for workers, webhooks and health checks.
// Falls back to system credentials from .env, or the first configured user in DB.
export const jira = jiraWith();
