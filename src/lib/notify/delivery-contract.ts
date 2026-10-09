/**
 * Notification delivery contract, error classification, and outbox state machine.
 *
 * This module defines vendor-neutral types and pure functions for delivery
 * outcomes, error classification, secret sanitization, and outbox state transitions.
 */

export type NotificationChannel = "push" | "discord" | "chat";

export type OutboxState = "pending" | "sent" | "failed" | "skipped";

export interface OutboxItem {
  id: string;
  userId: string;
  channel: string;
  title: string;
  body: string;
  link: string | null;
  attemptCount: number;
}

export type DeliveryOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string; cleanupSubscription?: boolean }
  | { status: "retry"; error: string; retryAfterMs?: number }
  | { status: "failed"; error: string; terminal?: boolean };

export interface DeliveryAdapter {
  readonly channel: string;
  deliver(item: OutboxItem): Promise<DeliveryOutcome>;
}

export interface DeliveryErrorClassification {
  isSubscriptionGone: boolean;
  isRetryable: boolean;
  retryAfterMs?: number;
  sanitizedMessage: string;
}

const MAX_ERROR_LENGTH = 500;

/**
 * Scrub secrets (Discord webhook tokens, Bot/Bearer auth headers) from error messages
 * to prevent credential leakage into outbox logs or database records.
 */
export function sanitizeErrorMessage(raw: string): string {
  if (!raw) return "";
  let sanitized = raw;

  // Redact Discord webhook token in URLs: https://discord.com/api/webhooks/<id>/<token>
  sanitized = sanitized.replace(
    /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)([A-Za-z0-9_-]+)/g,
    "$1[REDACTED_WEBHOOK_TOKEN]"
  );

  // Redact Bot or Bearer tokens
  sanitized = sanitized.replace(
    /\b(Bot|Bearer)\s+[A-Za-z0-9._~+/-]{10,}/gi,
    "$1 [REDACTED_TOKEN]"
  );

  // Redact generic token query params: ?token=xxx or &token=xxx
  sanitized = sanitized.replace(
    /([?&](?:token|secret|key|api_key)=)[^&\s]+/gi,
    "$1[REDACTED]"
  );

  return sanitized.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Classify errors from Web Push deliveries.
 * 404 / 410 / Gone / expired / not found indicate the push subscription is invalid and should be cleaned up.
 */
export function classifyPushError(error: unknown): DeliveryErrorClassification {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = sanitizeErrorMessage(rawMessage);

  const isSubscriptionGone =
    rawMessage.includes("404") ||
    rawMessage.includes("410") ||
    /Gone|expired|not.?found/i.test(rawMessage);

  return {
    isSubscriptionGone,
    isRetryable: !isSubscriptionGone,
    sanitizedMessage: sanitizedMessage || "push delivery failed",
  };
}

/**
 * Classify errors from Chat / Discord deliveries.
 * Extracts retry-after delays when present (e.g. from DiscordDeliveryError or 429).
 */
export function classifyChatError(error: unknown): DeliveryErrorClassification {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = sanitizeErrorMessage(rawMessage);

  let retryAfterMs: number | undefined;
  if (error && typeof error === "object" && "retryAfterMs" in error) {
    const candidate = Number((error as { retryAfterMs?: unknown }).retryAfterMs);
    if (Number.isFinite(candidate) && candidate > 0) {
      retryAfterMs = candidate;
    }
  }

  // Certain errors are unrecoverable configuration problems
  const isTerminal = /Invalid Discord (?:User ID|webhook URL)|not configured/i.test(rawMessage);

  return {
    isSubscriptionGone: false,
    isRetryable: !isTerminal,
    retryAfterMs,
    sanitizedMessage: sanitizedMessage || "chat delivery failed",
  };
}

/**
 * Generic classifier dispatching by channel name.
 */
export function classifyDeliveryError(
  channel: string,
  error: unknown
): DeliveryErrorClassification {
  if (channel === "discord" || channel === "chat") {
    return classifyChatError(error);
  }
  return classifyPushError(error);
}

export interface OutboxTransitionInput {
  item: OutboxItem;
  outcome: DeliveryOutcome;
  maxAttempts: number;
  now?: Date;
  computeBackoffMs?: (attempts: number) => number;
}

export interface OutboxTransitionResult {
  state: OutboxState;
  deliveredAt: Date | null;
  lastError: string | null;
  attemptCount: number;
  scheduledAt: Date | null;
  cleanupPushSubscription: boolean;
  isTerminalSuccess: boolean;
  isTerminalSkipped: boolean;
  isExhaustedFailure: boolean;
  isRescheduled: boolean;
}

/**
 * Pure state machine calculating the next outbox row state and scheduling parameters.
 */
export function computeOutboxTransition(
  input: OutboxTransitionInput
): OutboxTransitionResult {
  const { item, outcome, maxAttempts } = input;
  const now = input.now ?? new Date();
  const computeBackoff = input.computeBackoffMs ?? ((attempts: number) => 60_000 * 2 ** Math.min(attempts, 10));

  if (outcome.status === "sent") {
    return {
      state: "sent",
      deliveredAt: now,
      lastError: null,
      attemptCount: item.attemptCount,
      scheduledAt: null,
      cleanupPushSubscription: false,
      isTerminalSuccess: true,
      isTerminalSkipped: false,
      isExhaustedFailure: false,
      isRescheduled: false,
    };
  }

  if (outcome.status === "skipped") {
    return {
      state: "skipped",
      deliveredAt: now,
      lastError: outcome.reason,
      attemptCount: item.attemptCount,
      scheduledAt: null,
      cleanupPushSubscription: Boolean(outcome.cleanupSubscription),
      isTerminalSuccess: false,
      isTerminalSkipped: true,
      isExhaustedFailure: false,
      isRescheduled: false,
    };
  }

  if (outcome.status === "failed") {
    const attempts = item.attemptCount + 1;
    return {
      state: "failed",
      deliveredAt: null,
      lastError: outcome.error,
      attemptCount: attempts,
      scheduledAt: null,
      cleanupPushSubscription: false,
      isTerminalSuccess: false,
      isTerminalSkipped: false,
      isExhaustedFailure: true,
      isRescheduled: false,
    };
  }

  // outcome.status === "retry"
  const attempts = item.attemptCount + 1;
  const isExhausted = attempts >= maxAttempts;

  if (isExhausted) {
    return {
      state: "failed",
      deliveredAt: null,
      lastError: outcome.error,
      attemptCount: attempts,
      scheduledAt: null,
      cleanupPushSubscription: false,
      isTerminalSuccess: false,
      isTerminalSkipped: false,
      isExhaustedFailure: true,
      isRescheduled: false,
    };
  }

  const delayMs = outcome.retryAfterMs ?? computeBackoff(attempts - 1);
  const nextScheduled = new Date(now.getTime() + delayMs);

  return {
    state: "pending",
    deliveredAt: null,
    lastError: outcome.error,
    attemptCount: attempts,
    scheduledAt: nextScheduled,
    cleanupPushSubscription: false,
    isTerminalSuccess: false,
    isTerminalSkipped: false,
    isExhaustedFailure: false,
    isRescheduled: true,
  };
}
