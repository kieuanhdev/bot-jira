import { env } from "@/lib/env";

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
  let sanitized = raw;

  // Redact Bearer / auth tokens
  sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9._~+/-]{10,}/gi, "Bearer [REDACTED_TOKEN]");

  // Redact sensitive query parameters
  sanitized = sanitized.replace(/([?&](?:token|auth|key|secret)=)[^&\s]+/gi, "$1[REDACTED]");

  return sanitized.slice(0, 300);
}

/** Org/project/token a Sentry request is made with. Base URL is always the server's. */
export type SentryCreds = { org: string; project: string; token: string };

export async function requestSentry<T>(
  path: string,
  options?: SentryRequestOptions,
  creds: SentryCreds = { org: env.sentryOrg, project: env.sentryProject, token: env.sentryToken }
): Promise<T> {
  const base = env.sentryBaseUrl.replace(/\/$/, "");
  const url = `${base}/api/0/projects/${encodeURIComponent(creds.org)}/${encodeURIComponent(creds.project)}/${path}`;

  const signal = options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${creds.token}`,
      Accept: "application/json",
    },
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const safeText = sanitizeSentryErrorMessage(text);
    throw new Error(`Sentry ${path} -> ${res.status}: ${safeText}`);
  }

  return res.json() as Promise<T>;
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
