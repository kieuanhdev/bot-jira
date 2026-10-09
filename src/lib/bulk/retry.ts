import { prisma } from "@/lib/prisma";
import type { BulkAction, ActionParams } from "./contracts";
import {
  findBulkOperationById,
  findBulkOperationItemById,
  markBulkOperationItemRunning,
  recordBulkOperationItemResult,
} from "./repository";
import {
  applyItem,
  type OpAuth,
  type OpRow,
  type Ctx,
  type ItemResult,
} from "./executors";

export const MAX_ATTEMPTS = 3;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BACKOFF_MS = 1000;

export const RETRYABLE_OPERATION_STATES = [
  "completed",
  "partially_failed",
  "failed",
] as const;

export type RetryableOperationState = (typeof RETRYABLE_OPERATION_STATES)[number];

/**
 * Checks whether a bulk operation is in a state that permits retry.
 * Only finished operations (completed, partially_failed, failed) can be retried.
 */
export function isOperationRetryable(state: string): boolean {
  return (RETRYABLE_OPERATION_STATES as readonly string[]).includes(state);
}

/**
 * Checks whether an individual bulk operation item is eligible for retry.
 * Succeeded and skipped items are never retried. Only failed items with
 * retryable flag true can be re-executed.
 */
export function isItemRetryable(item: {
  status: string;
  retryable?: boolean | null;
}): boolean {
  return item.status === "failed" && item.retryable === true;
}

/**
 * Computes exponential/linear backoff delay in milliseconds for retry attempt.
 */
export function calculateRetryBackoff(
  attempt: number,
  baseMs: number = DEFAULT_RETRY_BACKOFF_MS
): number {
  return Math.max(0, baseMs * attempt);
}

/**
 * Classifies an arbitrary error to determine if it is retryable.
 */
export function isErrorRetryable(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object") {
    // Check explicit retryable flag (e.g. JiraRequestError, ItemResult)
    if ("retryable" in error && typeof (error as { retryable?: unknown }).retryable === "boolean") {
      return Boolean((error as { retryable: boolean }).retryable);
    }

    // Check status code
    if ("status" in error && typeof (error as { status?: unknown }).status === "number") {
      const status = (error as { status: number }).status;
      if (status === 429 || status === 502 || status === 503 || status === 504) {
        return true;
      }
      if (status >= 400 && status < 500) {
        return false;
      }
    }

    // Check error code or message
    const code = "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code.toUpperCase()
      : "";
    if (
      code === "ETIMEDOUT" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "EAI_AGAIN" ||
      code === "UND_ERR_CONNECT_TIMEOUT"
    ) {
      return true;
    }

    const message = "message" in error && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";
    if (
      message.includes("timeout") ||
      message.includes("network error") ||
      message.includes("rate limit") ||
      message.includes("econnreset") ||
      message.includes("socket hang up") ||
      message.includes("fetch failed")
    ) {
      return true;
    }
  }

  return false;
}

export type ProcessWithRetryDeps = {
  findOperation?: typeof findBulkOperationById;
  findItem?: typeof findBulkOperationItemById;
  markItemRunning?: typeof markBulkOperationItemRunning;
  recordItemResult?: typeof recordBulkOperationItemResult;
  applyItem?: typeof applyItem;
  fetchAfterState?: (key: string) => Promise<Record<string, unknown> | null>;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

async function defaultFetchAfterState(key: string) {
  return prisma.issueCache.findUnique({
    where: { jiraKey: key },
    select: {
      status: true,
      assigneeJira: true,
      labels: true,
      priority: true,
      points: true,
      fixVersionNames: true,
    },
  });
}

/**
 * Executes a single bulk operation item with retry logic, backoff, attempt counting,
 * and idempotency guard.
 *
 * Idempotency invariant (R-03):
 * If an item is already recorded as `succeeded`, it is never re-run.
 */
export async function processWithRetry(
  operationId: string,
  itemId: string,
  key: string,
  auth: OpAuth,
  concurrency: number,
  deps: ProcessWithRetryDeps = {}
): Promise<ItemResult> {
  const findOp = deps.findOperation ?? findBulkOperationById;
  const findItem = deps.findItem ?? findBulkOperationItemById;
  const markRunning = deps.markItemRunning ?? markBulkOperationItemRunning;
  const recordResult = deps.recordItemResult ?? recordBulkOperationItemResult;
  const apply = deps.applyItem ?? applyItem;
  const fetchAfter = deps.fetchAfterState ?? defaultFetchAfterState;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;

  const opRow = await findOp(operationId);
  if (!opRow) return { status: "skipped" };

  // Idempotency guard: never re-run an item that already succeeded.
  const current = await findItem(itemId);
  if (current?.status === "succeeded") return { status: "succeeded" };

  const op: OpRow = {
    id: opRow.id,
    type: opRow.type,
    requestedBy: opRow.requestedBy,
    payload: opRow.payload as { action: BulkAction; params: ActionParams },
    state: opRow.state,
    startedAt: opRow.startedAt,
  };
  const ctx: Ctx = { op, auth, concurrency };

  await markRunning(itemId);

  let result: ItemResult = { status: "failed", error: "not attempted", retryable: true };
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // BULK-012 — count every real attempt, not just the final pass.
    attempts++;
    result = await apply(ctx, key);
    if (result.status === "succeeded" || result.status === "skipped") break;
    if (!result.retryable) break;
    if (attempt < maxAttempts) {
      // Short backoff between attempts.
      await sleep(calculateRetryBackoff(attempt));
    }
  }

  const finalStatus = result.status;
  const after =
    result.status === "succeeded"
      ? await fetchAfter(key)
      : null;

  await recordResult(itemId, {
    status: finalStatus,
    error: result.error,
    retryable: result.retryable,
    attempts,
    after: after as Record<string, unknown> | null,
  });

  return { status: finalStatus, error: result.error, retryable: result.retryable };
}
