import { env } from "@/lib/env";
import { redactSecrets } from "@/lib/ai/sanitizer";

export type SentryIssue = {
  id: number;
  shortId: string;
  title: string;
  permalinkUrl?: string;
  // The REST issue list names the link `permalink`; webhooks use `permalinkUrl`.
  permalink?: string;
  level?: string;
  status?: string;
  firstSeen?: string;
  lastSeen?: string;
  latestEvent?: string;
  // Sentry's issue list returns the event count as a string.
  count?: number | string;
  userReportCount?: number;
  project?: { id?: number; slug?: string; name?: string };
};

export interface SentryRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Scrub secrets (Bearer tokens, secret query parameters) from error messages
 * to prevent credential leakage into server logs or audit trails.
 */
export function sanitizeSentryErrorMessage(raw: string): string {
  if (!raw) return "";
  return redactSecrets(raw).slice(0, 300);
}

/** Non-2xx response from Sentry. `message` is already sanitized (no tokens or secret query params). */
export class SentryRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SentryRequestError";
    this.status = status;
  }
}

/** Org/project/token a Sentry request is made with. Base URL is always the server's. */
export type SentryCreds = { org: string; project: string; token: string };

/** GET `{base}/api/0/{fullPath}` with the timeout and secret-free error message every Sentry call uses. */
async function fetchSentry<T>(
  fullPath: string,
  label: string,
  token: string,
  options?: SentryRequestOptions
): Promise<T> {
  const base = env.sentryBaseUrl.replace(/\/$/, "");
  const url = `${base}/api/0/${fullPath}`;

  const signal = options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const safeText = sanitizeSentryErrorMessage(text);
    throw new SentryRequestError(`Sentry ${label} -> ${res.status}: ${safeText}`, res.status);
  }

  return res.json() as Promise<T>;
}

export async function requestSentry<T>(
  path: string,
  options?: SentryRequestOptions,
  creds: SentryCreds = { org: env.sentryOrg, project: env.sentryProject, token: env.sentryToken }
): Promise<T> {
  return fetchSentry<T>(
    `projects/${encodeURIComponent(creds.org)}/${encodeURIComponent(creds.project)}/${path}`,
    path,
    creds.token,
    options
  );
}

/** Request a path under `/api/0/organizations/{org}/` (org-scoped endpoints). */
export async function requestSentryOrg<T>(
  path: string,
  creds: Pick<SentryCreds, "org" | "token">,
  options?: SentryRequestOptions
): Promise<T> {
  return fetchSentry<T>(`organizations/${encodeURIComponent(creds.org)}/${path}`, path, creds.token, options);
}

/** Raw event as returned by Sentry's event endpoints; only the fields we read are typed. */
export type SentryEvent = {
  eventID: string;
  culprit?: string;
  message?: string;
  platform?: string;
  tags?: { key: string; value: string }[];
  entries?: { type: string; data: unknown }[];
};

/**
 * Latest event of an issue. Needs the `event:read` scope.
 *
 * Tries GET /api/0/organizations/{org}/issues/{issueId}/events/latest/ first;
 * on a 404 retries the older base-relative GET /api/0/issues/{issueId}/events/latest/
 * with the same token. Both calls share one timeout budget.
 */
export async function getLatestEvent(
  issueId: string,
  creds: SentryCreds,
  options?: SentryRequestOptions
): Promise<SentryEvent> {
  const path = `issues/${encodeURIComponent(issueId)}/events/latest/`;
  const shared: SentryRequestOptions = {
    signal: options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  };
  try {
    return await requestSentryOrg<SentryEvent>(path, creds, shared);
  } catch (err) {
    if (!(err instanceof SentryRequestError) || err.status !== 404) throw err;
    return fetchSentry<SentryEvent>(path, path, creds.token, shared);
  }
}

/** Fill `permalinkUrl` from the REST field `permalink` so callers read one name. */
function withPermalink(issues: SentryIssue[]): SentryIssue[] {
  return issues.map((i) => ({ ...i, permalinkUrl: i.permalinkUrl ?? i.permalink }));
}

export const sentry = {
  /** List unresolved (new + ongoing) issues. Sentry's default order is most recently seen first. */
  async listUnresolvedIssues(
    limit = 50,
    options?: SentryRequestOptions
  ): Promise<SentryIssue[]> {
    return withPermalink(
      await requestSentry<SentryIssue[]>(`issues/?query=is%3Aunresolved&limit=${limit}`, options)
    );
  },

  async getIssue(
    issueId: number,
    options?: SentryRequestOptions
  ): Promise<SentryIssue & { body?: string }> {
    return requestSentry<SentryIssue & { body?: string }>(`issues/${issueId}/`, options);
  },
};

/** Sentry client bound to one user's own org/project/token. */
export function sentryWith(creds: SentryCreds) {
  return {
    async listUnresolvedIssues(
      limit = 25,
      options?: SentryRequestOptions
    ): Promise<SentryIssue[]> {
      return withPermalink(
        await requestSentry<SentryIssue[]>(
          `issues/?query=is%3Aunresolved&limit=${limit}`,
          options,
          creds
        )
      );
    },
  };
}
