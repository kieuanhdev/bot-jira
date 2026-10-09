/**
 * Sentry external ID resolution, label formatting, exponential backoff, and
 * idempotency guards.
 *
 * This module is completely pure (no Prisma / DB dependencies) to allow
 * standalone unit testing and shared reuse across the Sentry import worker and
 * webhook handler.
 */

export const DEFAULT_SENTRY_BACKOFF_BASE_MS = 60_000;
export const MAX_SENTRY_BACKOFF_EXPONENT = 10;

/** Extract a normalized stable string ID from a Sentry issue. */
export function sentryIdKey(issue: { id?: number | string; shortId?: string }): string {
  if (issue.id !== undefined && issue.id !== null && issue.id !== "") {
    return String(issue.id);
  }
  return String(issue.shortId ?? "");
}

/** Resolve the project slug from a Sentry issue or use fallback. */
export function sentryProjectSlug(
  issue: { project?: { slug?: string } },
  fallbackProject = "default-project"
): string {
  return issue.project?.slug ?? fallbackProject;
}

/**
 * Unique Jira label attached to imported issues for recovery and deduplication:
 * `sentry-id-<sentryIdKey>`
 */
export function sentryLabel(issue: { id?: number | string; shortId?: string }): string {
  return `sentry-id-${sentryIdKey(issue)}`;
}

/** Calculate exponential backoff duration in milliseconds for a retry attempt count. */
export function sentryBackoffMs(
  attemptCount: number,
  baseMs = DEFAULT_SENTRY_BACKOFF_BASE_MS
): number {
  return baseMs * 2 ** Math.min(attemptCount, MAX_SENTRY_BACKOFF_EXPONENT);
}

/** Check whether exponential backoff has elapsed since the last attempt. */
export function isBackoffElapsed(
  lastAttemptAt: Date | string | number | null | undefined,
  attemptCount: number,
  now = Date.now(),
  baseMs = DEFAULT_SENTRY_BACKOFF_BASE_MS
): boolean {
  if (!lastAttemptAt) return true;
  const lastTime =
    typeof lastAttemptAt === "number"
      ? lastAttemptAt
      : new Date(lastAttemptAt).getTime();
  const elapsed = now - lastTime;
  return elapsed >= sentryBackoffMs(attemptCount, baseMs);
}

/** Format deterministic notification/deduplication eventKey for a Sentry event. */
export function buildSentryEventKey(
  sentryProject: string,
  issueId: string,
  action?: string
): string {
  return `sentry:${sentryProject}:${issueId}:${action ?? "created"}`;
}

export type SentryImportStateRecord = {
  state?: string | null;
  jiraKey?: string | null;
  attemptCount?: number | null;
  lastAttemptAt?: Date | string | null;
};

export type SentrySkipDecision = {
  skip: boolean;
  reason?: "created" | "ignored" | "backoff_active";
};

/**
 * Determine whether a Sentry issue should be skipped during import processing
 * to maintain idempotency:
 * - Already created with an authoritative Jira key -> skip permanently
 * - Explicitly marked ignored (unmapped Sentry project) -> skip permanently
 * - Failed but exponential backoff has not yet elapsed -> skip until backoff window expires
 */
export function shouldSkipSentryImport(
  existing: SentryImportStateRecord | null | undefined,
  now = Date.now(),
  baseMs = DEFAULT_SENTRY_BACKOFF_BASE_MS
): SentrySkipDecision {
  if (!existing) return { skip: false };

  if (existing.state === "created" && existing.jiraKey) {
    return { skip: true, reason: "created" };
  }

  if (existing.state === "ignored") {
    return { skip: true, reason: "ignored" };
  }

  if (existing.state === "failed") {
    if (!isBackoffElapsed(existing.lastAttemptAt, existing.attemptCount ?? 0, now, baseMs)) {
      return { skip: true, reason: "backoff_active" };
    }
  }

  return { skip: false };
}
