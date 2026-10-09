import { env } from "@/lib/env";
import { JiraRequestError } from "@/lib/jira/client";
import { extractEpicKey } from "@/lib/issues/epic";
import {
  type BulkAction,
  actionParams,
} from "./contracts";

export type IssueRow = {
  jiraKey: string;
  projectKey: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersionIds: string[];
  fixVersionNames: string[];
  priority: string;
  type: string;
  points: number | null;
  dueDate?: Date | null;
  originalEstimateSeconds?: number | null;
  timeSpentSeconds?: number | null;
  updatedAt: Date | null;
  lastSyncedAt: Date;
  raw?: unknown;
};

// BULK-009 — reasons a transition could not be resolved. Only `no_transition`
// means "no path to this status"; the rest are upstream problems with distinct
// retryability (auth is not retryable, rate/unavailable are).
export type TransitionErrorKind =
  | "no_transition"
  | "auth_error"
  | "rate_limited"
  | "upstream_unavailable"
  | "unverified";

export function isTransitionError(e: unknown): TransitionErrorKind | null {
  if (e instanceof JiraRequestError) {
    if (e.status === 401 || e.status === 403) return "auth_error";
    if (e.status === 429) return "rate_limited";
    if (e.status != null && e.status >= 500) return "upstream_unavailable";
  }
  return null;
}

/** Whether a transition lookup failure is worth retrying later. */
export function isTransitionRetryable(kind: TransitionErrorKind | null): boolean {
  return kind === "rate_limited" || kind === "upstream_unavailable";
}

/**
 * BULK-007 — freshness is about the age of the *cache snapshot*, not the age of
 * the issue. `lastSyncedAt` is when we last read the row from Jira; `updatedAt`
 * is when Jira last mutated the issue (an old value is normal and means nothing
 * about staleness). Only the cache age is a staleness signal.
 */
export function isStale(lastSyncedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastSyncedAt.getTime() > env.jiraFreshnessMinutes * 60_000;
}

/**
 * BULK-005 — classify whether an action actually changes this issue's state.
 * `will_change` means the mutation differs from the current (cached) value;
 * `no_change` is a no-op that would only burn rate limits and clutter the audit
 * trail; `blocked` means it cannot be applied (e.g. no matching transition);
 * `unverified` means we could not confirm the current state, so we refuse to
 * guess (e.g. branch existence unknown).
 */
export type PreviewClassification = "will_change" | "no_change" | "blocked" | "unverified";

export type PreviewContext = {
  transitionName?: string | null;
  branchName?: string | null;
  branchExists?: boolean;
  fieldAvailable?: boolean;
};

export function classifyAction(
  action: BulkAction,
  issue: IssueRow,
  ctx: PreviewContext
): PreviewClassification {
  const p = actionParams(action);
  switch (action.kind) {
    case "update-fields": {
      if (ctx.fieldAvailable === false) return "blocked";
      const fields = action.value;
      const unchanged =
        (fields.assignee === undefined || fields.assignee === issue.assigneeJira) &&
        (fields.labels === undefined || (
          fields.labels.length === issue.labels.length &&
          fields.labels.slice().sort().join(",") === issue.labels.slice().sort().join(",")
        )) &&
        (fields.priority === undefined || fields.priority === issue.priority) &&
        (fields.issueType === undefined || fields.issueType === issue.type) &&
        (fields.points === undefined || fields.points === issue.points) &&
        (fields.dueDate === undefined || fields.dueDate === (issue.dueDate?.toISOString().slice(0, 10) ?? null)) &&
        (fields.estimate === undefined) &&
        (fields.fixVersions === undefined || (
          fields.fixVersions.length === issue.fixVersionNames.length &&
          fields.fixVersions.slice().sort().join(",") === issue.fixVersionNames.slice().sort().join(",")
        )) &&
        (fields.epic === undefined || fields.epic === extractEpicKey((issue as { raw?: unknown }).raw));
      return unchanged ? "no_change" : "will_change";
    }
    case "assign":
      return (p.assignee ?? null) === issue.assigneeJira ? "no_change" : "will_change";
    case "add-labels":
      return (p.labels ?? []).some((l) => !issue.labels.includes(l)) ? "will_change" : "no_change";
    case "remove-labels":
      return (p.labels ?? []).some((l) => issue.labels.includes(l)) ? "will_change" : "no_change";
    case "set-points":
      if (ctx.fieldAvailable === false) return "blocked";
      return (p.points ?? null) === issue.points ? "no_change" : "will_change";
    case "set-estimate":
      return ctx.fieldAvailable === false ? "blocked" : "will_change";
    case "log-work":
      return "will_change";
    case "set-due-date": {
      if (ctx.fieldAvailable === false) return "blocked";
      const current = issue.dueDate?.toISOString().slice(0, 10) ?? null;
      return current === (p.dueDate ?? null) ? "no_change" : "will_change";
    }
    case "set-priority":
      return p.priority === issue.priority ? "no_change" : "will_change";
    case "set-epic": {
      const currentEpic = extractEpicKey((issue as { raw?: unknown }).raw);
      return currentEpic === (p.epic ?? null) ? "no_change" : "will_change";
    }
    case "transition":
      if (ctx.transitionName == null) return "blocked";
      return p.status?.toLowerCase() === issue.status.toLowerCase() ? "no_change" : "will_change";
    case "add-fix-version":
      if (!p.fixVersion || issue.fixVersionNames.includes(p.fixVersion)) return "no_change";
      if (ctx.fieldAvailable === false) return "blocked";
      return "will_change";
    case "remove-fix-version":
      if (!p.fixVersion || !issue.fixVersionNames.includes(p.fixVersion)) return "no_change";
      if (ctx.fieldAvailable === false) return "blocked";
      return "will_change";
    case "add-comment":
      return "will_change";
    case "create-branches":
      if (ctx.branchExists === true) return "no_change";
      if (ctx.branchExists === false) return "will_change";
      return "unverified";
  }
}

/**
 * Compute the before/after snapshot for a single issue under a given action.
 * `after` reflects the intended Jira state (labels/fix-versions are merged),
 * while scalar fields are simply overwritten.
 */
export function computePreview(
  action: BulkAction,
  issue: IssueRow,
  ctx: PreviewContext
): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warning: string | null;
  classification: PreviewClassification;
} {
  const before: Record<string, unknown> = {
    status: issue.status,
    assignee: issue.assigneeJira,
    labels: issue.labels,
    priority: issue.priority,
    issueType: issue.type,
    points: issue.points,
    estimateSeconds: issue.originalEstimateSeconds,
    worklogSeconds: issue.timeSpentSeconds,
    dueDate: issue.dueDate?.toISOString().slice(0, 10) ?? null,
    fixVersions: issue.fixVersionNames,
    epic: extractEpicKey((issue as { raw?: unknown }).raw),
  };
  const after: Record<string, unknown> = { ...before };
  const warning = isStale(issue.lastSyncedAt, new Date()) ? "stale_data" : null;
  const classification = classifyAction(action, issue, ctx);

  const p = actionParams(action);
  switch (action.kind) {
    case "update-fields": {
      const fields = action.value;
      if (fields.assignee !== undefined) after.assignee = fields.assignee;
      if (fields.labels !== undefined) after.labels = fields.labels;
      if (fields.priority !== undefined) after.priority = fields.priority;
      if (fields.issueType !== undefined) after.issueType = fields.issueType;
      if (fields.points !== undefined) after.points = fields.points;
      if (fields.estimate !== undefined) after.estimateSeconds = fields.estimate;
      if (fields.dueDate !== undefined) after.dueDate = fields.dueDate;
      if (fields.fixVersions !== undefined) after.fixVersions = fields.fixVersions;
      if (fields.epic !== undefined) after.epic = fields.epic;
      break;
    }
    case "assign":
      after.assignee = p.assignee;
      break;
    case "add-labels":
      after.labels = Array.from(new Set([...issue.labels, ...(p.labels ?? [])]));
      break;
    case "remove-labels": {
      const drop = new Set(p.labels ?? []);
      after.labels = issue.labels.filter((l) => !drop.has(l));
      break;
    }
    case "set-points":
      after.points = p.points;
      break;
    case "set-estimate":
      after.estimateSeconds = p.estimate;
      break;
    case "log-work":
      after.worklog = p.worklog;
      break;
    case "set-due-date":
      after.dueDate = p.dueDate;
      break;
    case "set-priority":
      after.priority = p.priority;
      break;
    case "set-epic":
      after.epic = p.epic ?? null;
      break;
    case "transition":
      after.status = p.status;
      break;
    case "add-fix-version":
      if (p.fixVersion && !issue.fixVersionNames.includes(p.fixVersion)) {
        after.fixVersions = [...issue.fixVersionNames, p.fixVersion];
      }
      break;
    case "remove-fix-version":
      if (p.fixVersion) {
        const drop = new Set([p.fixVersion]);
        after.fixVersions = issue.fixVersionNames.filter((n) => !drop.has(n));
      }
      break;
    case "add-comment":
      after.comment = p.comment;
      break;
    case "create-branches":
      after.branch = ctx.branchName ?? null;
      break;
  }
  return { before, after, warning, classification };
}

/**
 * Determine the skipReason for an item based on its classification and error details.
 */
export function determineSkipReason(
  classification: PreviewClassification,
  opts?: {
    fieldSkipReason?: string | null;
    fieldAvailable?: boolean;
    transitionError?: TransitionErrorKind | null;
  }
): string | null {
  if (classification === "no_change") return "no_change";
  if (classification === "blocked") {
    return (
      opts?.fieldSkipReason ??
      (opts?.fieldAvailable === false
        ? "field_unavailable"
        : opts?.transitionError ?? "no_transition")
    );
  }
  if (classification === "unverified") return "unverified";
  return null;
}

export type PreviewItem = {
  jiraKey: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warning: string | null;
  transitionName: string | null;
  transitionError: TransitionErrorKind | null;
  branchName: string | null;
  targetField: { id: string; name: string } | null;
  targetVersionId: string | null;
  exists: boolean; // for create-branches: branch already present
  relation?: "explicit" | "dependency";
  depth?: number;
  via?: string;
  rootKey?: string;
  projectKey?: string;
  sameProject?: boolean;
};

export type PreviewResult = {
  operationId: string;
  type: string;
  total: number;
  items: (PreviewItem & { skipReason: string | null })[];
  /** Count of items that will actually be acted on. */
  actionable: number;
  /** Count of items that will be left untouched (no-op, blocked, unknown). */
  skipped: number;
  cycles?: Array<{ path: string[] }>;
  truncated?: boolean;
  selectedCount?: number;
  dependencyCount?: number;
  externalCount?: number;
};

export type TransitionGetter = {
  getTransitions: (key: string) => Promise<{ to?: { name?: string } }[]>;
  getEditMeta?: (key: string) => Promise<{ fields: Record<string, { name: string; allowedValues?: { id?: string; name?: string }[] }> }>;
  resolvePointsField?: (key: string) => Promise<{ id: string; name: string } | null>;
  resolveVersionId?: (projectKey: string, name: string) => Promise<string | null>;
};
