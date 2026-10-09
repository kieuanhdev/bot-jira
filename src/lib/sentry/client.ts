import { env } from "@/lib/env";

export type SentryIssue = {
  id: number;
  shortId: string;
  title: string;
  permalinkUrl?: string;
  level?: string;
  status?: string;
  firstSeen?: string;
  latestEvent?: string;
  count?: number;
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

export async function requestSentry<T>(
  path: string,
  options?: SentryRequestOptions
): Promise<T> {
  const base = env.sentryBaseUrl.replace(/\/$/, "");
  const url = `${base}/api/0/projects/${encodeURIComponent(env.sentryOrg)}/${encodeURIComponent(env.sentryProject)}/${path}`;

  const signal = options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.sentryToken}`,
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

export const sentry = {
  /** List unresolved (new + ongoing) issues, newest first. */
  async listUnresolvedIssues(
    limit = 50,
    options?: SentryRequestOptions
  ): Promise<SentryIssue[]> {
    return requestSentry<SentryIssue[]>(
      `issues/?query=is%3Aunresolved&limit=${limit}&sort=-newest`,
      options
    );
  },

  async getIssue(
    issueId: number,
    options?: SentryRequestOptions
  ): Promise<SentryIssue & { body?: string }> {
    return requestSentry<SentryIssue & { body?: string }>(`issues/${issueId}/`, options);
  },
};
