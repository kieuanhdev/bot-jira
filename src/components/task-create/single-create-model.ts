/**
 * Pure state machine for creating a single Jira task through the bulk pipeline
 * (preview → confirm → pg-boss worker → poll). Kept free of React so every
 * transition can be unit-tested.
 */
import type {
  BulkCreatePreviewResult,
  BulkCreateValidationError,
  BulkCreateValidationWarning,
} from "@/lib/bulk/create-types";

/** After this long with the op still queued, stop spinning and let the user close the form. */
export const SLOW_QUEUE_MS = 20_000;

/**
 * After this long in `creating`, whatever the op state, stop spinning: a running
 * op whose worker died (or a lost poll) must not hang the form forever.
 */
export const STUCK_CREATE_MS = 120_000;

/** Poll interval for `GET /api/bulk/operations/[id]` (same as bulk create progress). */
export const POLL_INTERVAL_MS = 2_000;

/** Preview warning codes that should stop auto-confirm and ask the user ("Vẫn tạo"). */
export const DUPLICATE_WARNING_CODES: ReadonlySet<string> = new Set([
  "DUPLICATE_SUMMARY_JIRA",
  "DUPLICATE_SUMMARY_BATCH",
]);

export type SingleCreateOperationState =
  | "preview"
  | "queued"
  | "running"
  | "completed"
  | "partially_failed"
  | "failed"
  | "cancelled";

/** Subset of the `GET /api/bulk/operations/[id]` payload the hook relies on. */
export type SingleCreateOperation = {
  id: string;
  state: SingleCreateOperationState;
  createItems?: Array<{ jiraKey: string | null; status: string; error: string | null }>;
};

/**
 * `projectKey` is the project captured at submit; it rides along to `done` so
 * cache invalidation and the success toast target the project the task was
 * created in, even if the caller's project prop changed meanwhile.
 */
export type SingleCreatePhase =
  | { kind: "idle" }
  | { kind: "previewing"; projectKey?: string }
  | { kind: "blocked"; errors: BulkCreateValidationError[] }
  | {
      kind: "duplicate";
      warnings: BulkCreateValidationWarning[];
      operationId: string;
      projectKey?: string;
    }
  | { kind: "creating"; operationId: string; startedAt: number; projectKey?: string }
  | { kind: "queued-slow"; operationId: string; projectKey?: string }
  | { kind: "done"; jiraKey: string; projectKey?: string }
  | { kind: "failed"; message: string };

export type SingleCreateEvent =
  | { type: "submit"; projectKey?: string }
  | { type: "preview-ok"; result: BulkCreatePreviewResult; now: number }
  | { type: "preview-error"; message: string }
  | { type: "force-confirm"; now: number }
  | { type: "confirm-error"; message: string }
  | { type: "poll"; operation: SingleCreateOperation }
  | { type: "tick"; now: number; opState?: SingleCreateOperationState }
  | { type: "reset" };

const TERMINAL_OP_STATES: ReadonlySet<SingleCreateOperationState> = new Set([
  "completed",
  "partially_failed",
  "failed",
  "cancelled",
]);

const FAILED_ITEM_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "blocked",
  "blocked_by_parent",
  "cancelled",
]);

const DEFAULT_FAILURE_MESSAGE = "Không tạo được task trên Jira";

export function isTerminalOperationState(state: SingleCreateOperationState | undefined): boolean {
  return state !== undefined && TERMINAL_OP_STATES.has(state);
}

/**
 * True while the UI should show a spinner. `queued-slow` is still busy (the op
 * may finish) but does not spin, so a stuck op never shows an endless loader.
 */
export function isSpinning(phase: SingleCreatePhase): boolean {
  return phase.kind === "previewing" || phase.kind === "creating";
}

function activeOperationId(s: SingleCreatePhase): string | null {
  return s.kind === "creating" || s.kind === "queued-slow" ? s.operationId : null;
}

function onPreview(
  result: BulkCreatePreviewResult,
  now: number,
  projectKey: string | undefined
): SingleCreatePhase {
  const blockedItems = result.items.filter((i) => i.classification === "blocked");
  if (result.blocked > 0 || blockedItems.length > 0) {
    const errors = blockedItems.flatMap((i) => i.errors);
    return {
      kind: "blocked",
      errors: errors.length > 0 ? errors : [{ code: "BLOCKED", message: "Dữ liệu chưa hợp lệ" }],
    };
  }
  const duplicates = result.items.flatMap((i) =>
    i.warnings.filter((w) => w.code !== undefined && DUPLICATE_WARNING_CODES.has(w.code))
  );
  if (duplicates.length > 0) {
    return { kind: "duplicate", warnings: duplicates, operationId: result.operationId, projectKey };
  }
  return { kind: "creating", operationId: result.operationId, startedAt: now, projectKey };
}

function onPoll(s: SingleCreatePhase, operation: SingleCreateOperation): SingleCreatePhase {
  if (activeOperationId(s) !== operation.id) return s;
  const item = operation.createItems?.[0];
  if (item?.jiraKey) {
    const projectKey = s.kind === "creating" || s.kind === "queued-slow" ? s.projectKey : undefined;
    return { kind: "done", jiraKey: item.jiraKey, projectKey };
  }
  if (item && FAILED_ITEM_STATUSES.has(item.status)) {
    return { kind: "failed", message: item.error || DEFAULT_FAILURE_MESSAGE };
  }
  if (isTerminalOperationState(operation.state)) {
    return { kind: "failed", message: item?.error || DEFAULT_FAILURE_MESSAGE };
  }
  return s;
}

export function singleCreateReducer(s: SingleCreatePhase, e: SingleCreateEvent): SingleCreatePhase {
  switch (e.type) {
    case "submit":
      // Never start a second preview while one is in flight or an op is creating.
      return s.kind === "previewing" || activeOperationId(s)
        ? s
        : { kind: "previewing", projectKey: e.projectKey };
    case "preview-ok":
      return s.kind === "previewing" ? onPreview(e.result, e.now, s.projectKey) : s;
    case "preview-error":
      return s.kind === "previewing" ? { kind: "failed", message: e.message } : s;
    case "force-confirm":
      return s.kind === "duplicate"
        ? { kind: "creating", operationId: s.operationId, startedAt: e.now, projectKey: s.projectKey }
        : s;
    case "confirm-error":
      return activeOperationId(s) ? { kind: "failed", message: e.message } : s;
    case "poll":
      return onPoll(s, e.operation);
    case "tick": {
      if (s.kind !== "creating") return s;
      const elapsed = e.now - s.startedAt;
      const stillQueued = e.opState === undefined || e.opState === "preview" || e.opState === "queued";
      return elapsed >= STUCK_CREATE_MS || (stillQueued && elapsed >= SLOW_QUEUE_MS)
        ? { kind: "queued-slow", operationId: s.operationId, projectKey: s.projectKey }
        : s;
    }
    case "reset":
      return { kind: "idle" };
  }
}
