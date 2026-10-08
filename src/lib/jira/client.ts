import { env } from "@/lib/env";
import { getEpicLinkFieldIds, isEpicLinkField, setEpicLinkFieldIds } from "@/lib/issues/epic";
import type { JiraFieldDefinition, JiraMyPermissions, JiraUser } from "./types";
import type { JiraAuth } from "./auth";
import { JiraRequestError } from "./errors";
import { createBoardResource } from "./resources/boards";
import { createIssueResource } from "./resources/issues";
import { createPermissionResource } from "./resources/permissions";
import { createProjectResource } from "./resources/projects";
import { createVersionResource } from "./resources/versions";
import { createWorklogResource } from "./resources/worklogs";

export type { JiraAuth } from "./auth";
export { JiraRequestError } from "./errors";

const BASE_ISSUE_FIELDS = [
  "project",
  "parent",
  "summary",
  "description",
  "status",
  "statuscategorychangedate",
  "resolutiondate",
  "customfield_10706",
  "customfield_10709",
  "assignee",
  "reporter",
  "customfield_10300",
  "customfield_10501",
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
    ? [
        {
          id: env.jiraPointsFieldId,
          name: "Configured points",
          custom: true,
          schema: { type: "number" },
        },
      ]
    : [];
}

function rememberPointFields(fields: JiraFieldDefinition[]): JiraFieldDefinition[] {
  setEpicLinkFieldIds(fields.filter(isEpicLinkField).map((field) => field.id));
  knownPointFields = fields.filter(isPointField);
  return knownPointFields;
}

function knownPointFieldIds(): string[] {
  return [...configuredPointField(), ...knownPointFields].map((field) => field.id);
}

export function jiraIssueFields(extraFields: string[] = []): string {
  return [...BASE_ISSUE_FIELDS, ...extraFields, ...knownPointFieldIds(), ...getEpicLinkFieldIds()]
    .filter(Boolean)
    .filter((field, index, fields) => fields.indexOf(field) === index)
    .join(",");
}

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

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export function extractJiraErrorDetail(
  rawBody?: string | null,
  maxLength = 300
): string | null {
  if (!rawBody || typeof rawBody !== "string") return null;
  const trimmed = rawBody.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  try {
    const parsed = JSON.parse(trimmed) as {
      errorMessages?: unknown;
      errors?: unknown;
      message?: unknown;
    };
    if (!parsed || typeof parsed !== "object") return null;

    const parts: string[] = [];
    if (parsed.errors && typeof parsed.errors === "object" && !Array.isArray(parsed.errors)) {
      for (const [field, value] of Object.entries(parsed.errors)) {
        if (typeof value === "string" && value.trim()) {
          const cleanValue = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
          if (cleanValue) parts.push(`${field}: ${cleanValue}`);
        }
      }
    }

    if (Array.isArray(parsed.errorMessages)) {
      for (const message of parsed.errorMessages) {
        if (typeof message === "string" && message.trim()) {
          const cleanMessage = message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
          if (cleanMessage) parts.push(cleanMessage);
        }
      }
    } else if (typeof parsed.message === "string" && parsed.message.trim()) {
      const cleanMessage = parsed.message.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      if (cleanMessage) parts.push(cleanMessage);
    }

    if (parts.length === 0) return null;
    let combined = parts.join("; ");
    if (combined.length > maxLength) combined = combined.slice(0, maxLength - 3) + "...";
    return combined;
  } catch {
    return null;
  }
}

export function parseJiraDate(value?: string | null): Date | undefined {
  if (!value) return undefined;
  const iso = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function canCreateProjectVersion(response?: JiraMyPermissions | null): boolean {
  if (!response || typeof response !== "object" || !response.permissions) return false;
  const permissions = response.permissions;
  return Boolean(
    permissions.ADMINISTER_PROJECTS?.havePermission ||
      permissions.MANAGE_VERSIONS?.havePermission ||
      permissions.PROJECT_ADMIN?.havePermission ||
      permissions.ADMINISTER?.havePermission ||
      permissions.SYSTEM_ADMIN?.havePermission
  );
}

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
    const syncUsername = env.jiraSyncUsername.trim();
    const user = await prisma.user.findFirst({
      where: {
        jiraTokenEnc: { not: null },
        ...(syncUsername
          ? { jiraUsername: { equals: syncUsername, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
    });
    if (user?.jiraTokenEnc) {
      const token = safeDecrypt(user.jiraTokenEnc);
      if (token) {
        const username = user.jiraUsername || safeDecrypt(user.jiraUserEnc) || "";
        const authMode =
          (user.jiraAuth || "Bearer").toLowerCase() === "basic" ? "basic" : "Bearer";
        return { user: username, token, authMode };
      }
    }
  } catch {
    // Database may not be connected yet.
  }
  return null;
}

export async function hasJiraCredentials(): Promise<boolean> {
  if (!env.jiraBaseUrl) return false;
  return Boolean(await getSystemJiraAuth());
}

function authHeader(auth: JiraAuth): string {
  return auth.authMode === "basic"
    ? `Basic ${Buffer.from(`${auth.user}:${auth.token}`).toString("base64")}`
    : `Bearer ${auth.token}`;
}

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
  for (const auth of candidates) {
    try {
      const response = await fetch(`${base}/rest/api/2/myself`, {
        headers: { Accept: "application/json", Authorization: authHeader(auth) },
      });
      if (response.ok) {
        const user = (await response.json()) as JiraUser;
        const identityKey = computeJiraIdentityKey(user);
        return {
          mode: auth.authMode,
          name: user.name || user.displayName,
          key: user.key,
          displayName: user.displayName,
          emailAddress: user.emailAddress,
          active: user.active,
          jiraIdentityKey: identityKey ?? undefined,
        };
      }
    } catch {
      // Try the next auth mode.
    }
  }
  return null;
}

export async function probeJiraAuth(userAuth: JiraAuth | null): Promise<boolean> {
  if (!userAuth) return false;
  try {
    const base = env.jiraBaseUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/rest/api/2/myself`, {
      headers: { Accept: "application/json", Authorization: authHeader(userAuth) },
      signal: AbortSignal.timeout(env.jiraRequestTimeoutMs),
    });
    return response.ok;
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
    const systemAuth = await getSystemJiraAuth();
    if (systemAuth) effectiveAuth = systemAuth;
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
  if (init.signal?.aborted) {
    controller.abort(init.signal.reason);
  } else {
    init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: authHeader(effectiveAuth),
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      let detail: string | null = null;
      try {
        detail = extractJiraErrorDetail(await response.text());
      } catch {
        // Do not reflect an unreadable upstream body.
      }
      const baseMessage = `Jira ${init.method ?? "GET"} ${path.split("?")[0]} -> ${response.status}`;
      throw new JiraRequestError(
        detail ? `${baseMessage}: ${detail}` : baseMessage,
        response.status,
        response.status === 408 || response.status === 429 || response.status >= 500,
        detail,
        parseRetryAfterMs(response.headers.get("retry-after"))
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
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
const MAX_RETRY_DELAY_MS = 30_000;
const RETRY_BASE_MS = 2000;

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
      const retryAfterMs = error instanceof JiraRequestError ? error.retryAfterMs : null;
      const delayMs =
        Math.min(retryAfterMs ?? RETRY_BASE_MS * 2 ** attempt, MAX_RETRY_DELAY_MS) +
        Math.floor(Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

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

  const boundRequest = <T>(path: string, init: RequestInit = {}) =>
    request<T>(path, init, auth);
  const boundRequestOnce = <T>(path: string, init: RequestInit = {}) =>
    requestOnce<T>(path, init, auth);

  return {
    me: () => boundRequest<JiraUser>("/rest/api/2/myself"),
    getConfiguration: () =>
      boundRequest<{ timeTrackingEnabled?: boolean }>("/rest/api/2/configuration"),
    ...createIssueResource({
      request: boundRequest,
      getPointFields,
      configuredPointFields: configuredPointField,
      issueFields: jiraIssueFields,
      knownPointFieldIds,
      epicLinkFieldIds: getEpicLinkFieldIds,
      isPointField,
      configuredPointFieldId: env.jiraPointsFieldId,
    }),
    ...createWorklogResource({ request: boundRequest, requestOnce: boundRequestOnce }),
    ...createPermissionResource(boundRequest, auth),
    ...createProjectResource(boundRequest),
    ...createVersionResource(boundRequest),
    ...createBoardResource(boundRequest),
  };
}

export type JiraClient = ReturnType<typeof jiraWith>;

export const jira = jiraWith();
