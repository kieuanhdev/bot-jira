import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, bitbucketRepoList } from "@/lib/env";
import { jiraWith, jiraIssueFields, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import { bitbucket, type BbCreds } from "@/lib/bitbucket/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import type { JiraIssue } from "@/lib/jira/types";
import { userJiraAuth, userBitbucketCreds } from "@/lib/user-creds";
import { renderBranchName } from "./branch-name";
import { recordExplicitBranchLink } from "@/lib/bitbucket/link-service";
import { expandDependencies } from "@/lib/issues/dependencies";
import { audit } from "@/lib/audit";
import { formatJiraStartedAt } from "@/lib/worklogs/schema";

/**
 * M4 — Bulk operations.
 *
 * A user requests a bulk change against a set of Jira issues. The flow is:
 *   1. Preview  (no mutation) — validates each issue and records before/after.
 *   2. Confirm  — the caller re-sends the operation id to authorize execution.
 *   3. Worker   — a pg-boss job processes items one by one with a concurrency
 *                 cap, retries transient failures, updates the cache after
 *                 each item, and never re-runs a succeeded item.
 *
 * This module is shared by the API routes (preview/confirm) and the worker
 * (execute). It deliberately does NOT import Next.js server modules so the
 * worker process can reuse it.
 */

export type DependencyScope = "none" | "direct" | "recursive";

export type BulkFieldValues = {
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  issueType?: string;
  points?: number | null;
  estimate?: string;
  dueDate?: string | null;
  fixVersions?: string[];
  epic?: string | null;
};

export type BulkAction =
  | { kind: "update-fields"; value: BulkFieldValues }
  | { kind: "assign"; value: string | null }
  | { kind: "add-labels"; value: string[] }
  | { kind: "remove-labels"; value: string[] }
  | { kind: "set-points"; value: number | null }
  | { kind: "set-estimate"; value: string }
  | { kind: "log-work"; value: { timeSpent: string; started?: string; comment?: string } }
  | { kind: "set-due-date"; value: string | null }
  | { kind: "set-priority"; value: string }
  | { kind: "set-epic"; value: string | null }
  | { kind: "transition"; value: string }
  | { kind: "add-fix-version"; value: string; dependencyScope?: DependencyScope }
  | { kind: "remove-fix-version"; value: string; dependencyScope?: DependencyScope; forceRemove?: boolean }
  | { kind: "add-comment"; value: string }
  | { kind: "create-branches"; value: BranchParams };

export type BranchParams = {
  /** Bitbucket repo slug, e.g. "team/app". Defaults to the first configured repo. */
  repo?: string;
  /** Base branch to branch off from. Defaults to the configured base branch. */
  base?: string;
  /**
   * Template for the generated branch name. Supports: {issue} (EPM-123),
   * {project} (EPM), {number} (123), {status} (workflow status, lowercased,
   * spaces -> dashes). Defaults to "{project}-{number}".
   */
  nameTemplate?: string;
  /** Add a comment to the issue linking the created branch. */
  comment?: boolean;
};

export const DEFAULT_BRANCH_TEMPLATE = env.bulkBranchTemplate || "{project}-{number}";
export const MAX_KEYS = 500;
export const MAX_FILTER_KEYS = 5000;

export type BulkSelector =
  | { mode: "keys"; keys: string[] }
  | {
      mode: "filter";
      project: string;
      filters: {
        q?: string;
        assignees?: string[] | "ALL";
        statuses?: string[];
        labels?: string[];
        priorities?: string[];
        epics?: string[];
      };
    };

type IssueRow = {
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

export function extractEpicKey(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.parent && typeof r.parent === "object" && typeof (r.parent as { key?: unknown }).key === "string") {
    return (r.parent as { key: string }).key;
  }
  if (r.epic && typeof r.epic === "object" && typeof (r.epic as { key?: unknown }).key === "string") {
    return (r.epic as { key: string }).key;
  }
  for (const [key, val] of Object.entries(r)) {
    if (key.startsWith("customfield_") && typeof val === "string" && /^[A-Z][A-Z0-9_]+-\d+$/i.test(val)) {
      return val.toUpperCase();
    }
  }
  return null;
}

type ActionParams = {
  fields?: BulkFieldValues;
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  points?: number | null;
  estimate?: string;
  worklog?: { timeSpent: string; started?: string; comment?: string };
  dueDate?: string | null;
  status?: string;
  fixVersion?: string;
  comment?: string;
  branches?: BranchParams;
  epic?: string | null;
};

export function actionParams(action: BulkAction): ActionParams {
  switch (action.kind) {
    case "update-fields":
      return { fields: action.value };
    case "assign":
      return { assignee: action.value };
    case "add-labels":
    case "remove-labels":
      return { labels: action.value };
    case "set-points":
      return { points: action.value };
    case "set-estimate":
      return { estimate: action.value };
    case "log-work":
      return { worklog: action.value };
    case "set-due-date":
      return { dueDate: action.value };
    case "set-priority":
      return { priority: action.value };
    case "set-epic":
      return { epic: action.value };
    case "transition":
      return { status: action.value };
    case "add-fix-version":
    case "remove-fix-version":
      return { fixVersion: action.value };
    case "add-comment":
      return { comment: action.value };
    case "create-branches":
      return { branches: action.value };
  }
}

// ---------------------------------------------------------------------------
// BULK-004 — server-side validation of actions and key selections.
//
// The API used to cast the raw JSON body to `BulkAction` and rely on the client
// to send well-formed data. These checks run on the server so a custom client
// can't trigger a worker failure or persist an unrunnable payload. They are
// pure and shared by the API and the tests (no Prisma/env/HTTP imports).
// ---------------------------------------------------------------------------

const KNOWN_ACTION_KINDS = [
  "update-fields",
  "assign",
  "add-labels",
  "remove-labels",
  "set-points",
  "set-estimate",
  "log-work",
  "set-due-date",
  "set-priority",
  "set-epic",
  "transition",
  "add-fix-version",
  "remove-fix-version",
  "add-comment",
  "create-branches",
] as const;

const MAX_LABELS_PER_ACTION = 50;
const MAX_LABEL_LENGTH = 100;
const MAX_COMMENT_LENGTH = 4000;
const MAX_STRING_FIELD = 200;
const MAX_BRANCH_TEMPLATE_LENGTH = 100;
const MAX_WORKLOG_COMMENT_LENGTH = 4000;
const JIRA_DURATION_RE = /^(?=.*\d)(?:\d+(?:w|d|h|m)\s*)+$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type ValidationResult =
  | { ok: true; keys: string[]; action: BulkAction; selector?: BulkSelector }
  | { ok: false; errors: string[] };

/**
 * Validate a bulk request body. Returns normalized keys (trimmed, uppercased,
 * deduplicated) and a validated action, or a list of field errors. Empty keys
 * after normalization are rejected rather than silently producing nothing, and
 * the list must not exceed MAX_KEYS.
 */
export function validateBulkRequest(body: unknown, resolvedKeys?: string[]): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, errors: ["request body must be an object"] };

  const rawSelector = body.selector;
  const rawKeys = body.keys;
  const rawAction = body.action;

  let selector: BulkSelector | undefined;
  let targetKeys: unknown = rawKeys;
  let isFilterMode = false;

  if (rawSelector !== undefined) {
    if (!isPlainObject(rawSelector)) {
      return { ok: false, errors: ["selector must be an object"] };
    }
    const mode = rawSelector.mode;
    if (mode === "keys") {
      if (!Array.isArray(rawSelector.keys)) {
        return { ok: false, errors: ["selector.keys must be an array"] };
      }
      selector = { mode: "keys", keys: rawSelector.keys as string[] };
      targetKeys = rawSelector.keys;
    } else if (mode === "filter") {
      if (typeof rawSelector.project !== "string" || !rawSelector.project.trim()) {
        return { ok: false, errors: ["selector.project must be a non-empty string"] };
      }
      selector = {
        mode: "filter",
        project: rawSelector.project.trim().toUpperCase(),
        filters: (isPlainObject(rawSelector.filters) ? rawSelector.filters : {}) as BulkSelector extends { mode: "filter" } ? BulkSelector["filters"] : never,
      };
      isFilterMode = true;
      targetKeys = resolvedKeys !== undefined ? resolvedKeys : [];
    } else {
      return { ok: false, errors: [`unknown selector mode: ${String(mode)}`] };
    }
  }

  if (!Array.isArray(targetKeys)) return { ok: false, errors: ["keys must be an array"] };

  const errors: string[] = [];

  const keys = targetKeys
    .filter((k): k is string => typeof k === "string")
    .map(normalizeKey)
    .filter(Boolean);
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) {
    errors.push(isFilterMode ? "no matching keys found for selector filter" : "keys must contain at least one non-empty key");
  }
  const keyLimit = isFilterMode ? MAX_FILTER_KEYS : MAX_KEYS;
  if (uniqueKeys.length > keyLimit) {
    errors.push(`too many keys: ${uniqueKeys.length} (max ${keyLimit})`);
  }

  let action: BulkAction | null = null;
  if (!isPlainObject(rawAction)) {
    errors.push("action must be an object");
  } else {
    const kind = rawAction.kind;
    if (typeof kind !== "string" || !(KNOWN_ACTION_KINDS as readonly string[]).includes(kind)) {
      errors.push(`unknown action kind: ${String(kind)}`);
    } else {
      switch (kind) {
        case "update-fields": {
          const v = rawAction.value;
          if (!isPlainObject(v)) {
            errors.push("update-fields.value must be an object");
            break;
          }
          const projectKeys = new Set(uniqueKeys.map((k) => k.split("-")[0]));
          if (projectKeys.size > 1) {
            errors.push("all keys must belong to the same project");
          }
          const fields: BulkFieldValues = {};
          if ("assignee" in v) {
            if (v.assignee === null || (isNonEmptyString(v.assignee) && v.assignee.length <= MAX_STRING_FIELD)) fields.assignee = v.assignee as string | null;
            else errors.push("update-fields.value.assignee must be a string or null");
          }
          if ("labels" in v) {
            if (Array.isArray(v.labels) && v.labels.every((item) => typeof item === "string")) {
              const values = Array.from(new Set(v.labels.map((item) => item.trim()).filter(Boolean)));
              if (values.length > MAX_LABELS_PER_ACTION) errors.push("update-fields.value.labels has too many values");
              else if (values.some((item) => item.length > MAX_LABEL_LENGTH)) errors.push("label too long");
              else fields.labels = values;
            } else errors.push("update-fields.value.labels must be an array of strings");
          }
          if ("priority" in v) {
            if (isNonEmptyString(v.priority) && v.priority.length <= MAX_STRING_FIELD) fields.priority = v.priority.trim();
            else errors.push("update-fields.value.priority must be a non-empty string");
          }
          if ("issueType" in v) {
            if (isNonEmptyString(v.issueType) && v.issueType.length <= MAX_STRING_FIELD) fields.issueType = v.issueType.trim();
            else errors.push("update-fields.value.issueType must be a non-empty string");
          }
          if ("points" in v) {
            if (v.points === null || (typeof v.points === "number" && Number.isInteger(v.points) && v.points >= 0)) fields.points = v.points as number | null;
            else errors.push("update-fields.value.points must be a non-negative integer or null");
          }
          if ("estimate" in v) {
            if (isNonEmptyString(v.estimate) && JIRA_DURATION_RE.test(v.estimate.trim())) fields.estimate = v.estimate.trim();
            else errors.push("update-fields.value.estimate must be a Jira duration");
          }
          if ("dueDate" in v) {
            if (v.dueDate === null || (typeof v.dueDate === "string" && isValidIsoDate(v.dueDate))) fields.dueDate = v.dueDate as string | null;
            else errors.push("update-fields.value.dueDate must be an ISO date or null");
          }
          if ("fixVersions" in v) {
            if (Array.isArray(v.fixVersions) && v.fixVersions.every((item) => isNonEmptyString(item))) fields.fixVersions = Array.from(new Set(v.fixVersions.map((item) => item.trim())));
            else errors.push("update-fields.value.fixVersions must be an array of strings");
          }
          if ("epic" in v) {
            if (v.epic === null || (isNonEmptyString(v.epic) && /^[A-Z][A-Z0-9_]+-\d+$/i.test(v.epic.trim()))) {
              fields.epic = v.epic === null ? null : v.epic.trim().toUpperCase();
            } else {
              errors.push("update-fields.value.epic must be a valid Jira issue key or null");
            }
          }
          if (Object.keys(fields).length === 0) errors.push("update-fields.value must contain at least one field");
          action = { kind, value: fields };
          break;
        }
        case "assign":
          if (rawAction.value == null || isNonEmptyString(rawAction.value)) {
            const v = rawAction.value as string | null;
            if (v != null && v.length > MAX_STRING_FIELD)
              errors.push("assign.value too long");
            action = { kind, value: v };
          } else {
            errors.push("assign.value must be a string or null");
          }
          break;
        case "add-labels":
        case "remove-labels":
          if (!Array.isArray(rawAction.value)) {
            errors.push(`${kind}.value must be an array of strings`);
          } else {
            const labels = Array.from(
              new Set(
                rawAction.value
                  .filter((l): l is string => typeof l === "string")
                  .map((l) => l.trim())
                  .filter(Boolean)
              )
            ).slice(0, MAX_LABELS_PER_ACTION);
            if (labels.length === 0) errors.push(`${kind}.value must contain at least one label`);
            if (labels.some((l) => l.length > MAX_LABEL_LENGTH)) errors.push("label too long");
            action = { kind, value: labels } as BulkAction;
          }
          break;
        case "set-points": {
          const v = rawAction.value;
          if (v == null || (typeof v === "number" && Number.isInteger(v) && v >= 0)) {
            action = { kind, value: (v ?? null) as number | null };
          } else {
            errors.push("set-points.value must be a non-negative integer or null");
          }
          break;
        }
        case "set-estimate": {
          const v = rawAction.value;
          if (isNonEmptyString(v) && JIRA_DURATION_RE.test(v.trim())) {
            action = { kind, value: v.trim() };
          } else {
            errors.push("set-estimate.value must be a Jira duration such as 2h or 1d 4h");
          }
          break;
        }
        case "set-due-date": {
          const v = rawAction.value;
          if (v === null || (typeof v === "string" && isValidIsoDate(v))) {
            action = { kind, value: v };
          } else {
            errors.push("set-due-date.value must be an ISO date (YYYY-MM-DD) or null");
          }
          break;
        }
        case "log-work": {
          const v = rawAction.value;
          if (!isPlainObject(v) || !isNonEmptyString(v.timeSpent) || !JIRA_DURATION_RE.test(v.timeSpent.trim())) {
            errors.push("log-work.value.timeSpent must be a Jira duration such as 30m or 2h");
            break;
          }
          if (v.started !== undefined && (typeof v.started !== "string" || isNaN(new Date(v.started).getTime()))) {
            errors.push("log-work.value.started must be a valid ISO date or datetime");
          }
          if (v.comment !== undefined && (typeof v.comment !== "string" || v.comment.length > MAX_WORKLOG_COMMENT_LENGTH)) {
            errors.push("log-work.value.comment is invalid or too long");
          }
          action = {
            kind,
            value: {
              timeSpent: v.timeSpent.trim(),
              ...(typeof v.started === "string" ? { started: v.started } : {}),
              ...(typeof v.comment === "string" && v.comment.trim() ? { comment: v.comment.trim() } : {}),
            },
          };
          break;
        }
        case "set-priority":
        case "transition":
        case "add-comment": {
          const v = rawAction.value;
          if (isNonEmptyString(v)) {
            const max = kind === "add-comment" ? MAX_COMMENT_LENGTH : MAX_STRING_FIELD;
            if (v.length > max) errors.push(`${kind}.value too long`);
            else action = { kind, value: v } as BulkAction;
          } else {
            errors.push(`${kind}.value must be a non-empty string`);
          }
          break;
        }
        case "set-epic": {
          const v = rawAction.value;
          if (v === null || (isNonEmptyString(v) && /^[A-Z][A-Z0-9_]+-\d+$/i.test(v.trim()))) {
            action = { kind, value: v === null ? null : v.trim().toUpperCase() };
          } else {
            errors.push("set-epic.value must be a valid Jira issue key or null");
          }
          break;
        }
        case "add-fix-version": {
          const v = rawAction.value;
          if (isNonEmptyString(v)) {
            if (v.length > MAX_STRING_FIELD) {
              errors.push("add-fix-version.value too long");
            } else {
              let scope: DependencyScope = "recursive";
              if (rawAction.dependencyScope !== undefined) {
                if (["none", "direct", "recursive"].includes(String(rawAction.dependencyScope))) {
                  scope = rawAction.dependencyScope as DependencyScope;
                } else {
                  errors.push("dependencyScope must be 'none', 'direct', or 'recursive'");
                }
              }
              action = { kind: "add-fix-version", value: v, dependencyScope: scope };
            }
          } else {
            errors.push("add-fix-version.value must be a non-empty string");
          }
          break;
        }
        case "remove-fix-version": {
          const v = rawAction.value;
          if (isNonEmptyString(v)) {
            if (v.length > MAX_STRING_FIELD) {
              errors.push("remove-fix-version.value too long");
            } else {
              let scope: DependencyScope = "recursive";
              if (rawAction.dependencyScope !== undefined) {
                if (["none", "direct", "recursive"].includes(String(rawAction.dependencyScope))) {
                  scope = rawAction.dependencyScope as DependencyScope;
                } else {
                  errors.push("dependencyScope must be 'none', 'direct', or 'recursive'");
                }
              }
              const force = rawAction.forceRemove === true;
              action = { kind: "remove-fix-version", value: v, dependencyScope: scope, forceRemove: force };
            }
          } else {
            errors.push("remove-fix-version.value must be a non-empty string");
          }
          break;
        }
        case "create-branches": {
          const v = rawAction.value;
          if (!isPlainObject(v)) {
            errors.push("create-branches.value must be an object");
            break;
          }
          const bp: BranchParams = {};
          if (v.repo !== undefined) {
            if (isNonEmptyString(v.repo) && v.repo.length <= MAX_STRING_FIELD) bp.repo = v.repo.trim();
            else errors.push("create-branches.value.repo must be a non-empty string");
          }
          if (v.base !== undefined) {
            if (isNonEmptyString(v.base) && v.base.length <= MAX_STRING_FIELD) bp.base = v.base.trim();
            else errors.push("create-branches.value.base must be a non-empty string");
          }
          if (v.nameTemplate !== undefined) {
            if (isNonEmptyString(v.nameTemplate) && v.nameTemplate.length <= MAX_BRANCH_TEMPLATE_LENGTH)
              bp.nameTemplate = v.nameTemplate.trim();
            else errors.push("create-branches.value.nameTemplate must be a non-empty string");
          }
          if (v.comment !== undefined) {
            if (typeof v.comment === "boolean") bp.comment = v.comment;
            else errors.push("create-branches.value.comment must be a boolean");
          }
          action = { kind, value: bp };
          break;
        }
        default:
          // unreachable — kind already validated
          break;
      }
    }
  }

  if (errors.length > 0 || action == null) return { ok: false, errors };
  return { ok: true, keys: uniqueKeys, action, ...(selector ? { selector } : {}) };
}

/**
 * Resolve matching Jira issue keys from local DB cache for a filter selector.
 * Allows bulk operations on large task sets (>1000) matching criteria without client truncation.
 */
export async function resolveFilterKeys(
  project: string,
  filters: {
    q?: string;
    assignees?: string[] | "ALL";
    statuses?: string[];
    labels?: string[];
    priorities?: string[];
    epics?: string[];
  },
  jiraUsername?: string | null,
  maxKeys: number = MAX_FILTER_KEYS
): Promise<string[]> {
  const where: Prisma.IssueCacheWhereInput = {
    deletedAt: null,
    projectKey: project.trim().toUpperCase(),
  };

  if (filters.statuses && filters.statuses.length > 0) {
    if (filters.statuses.length === 1) {
      where.status = filters.statuses[0];
    } else {
      where.status = { in: filters.statuses };
    }
  }

  if (filters.priorities && filters.priorities.length > 0) {
    if (filters.priorities.length === 1) {
      where.priority = filters.priorities[0];
    } else {
      where.priority = { in: filters.priorities };
    }
  }

  if (filters.labels && filters.labels.length > 0) {
    if (filters.labels.length === 1) {
      where.labels = { has: filters.labels[0] };
    } else {
      where.labels = { hasSome: filters.labels };
    }
  }

  if (filters.q && filters.q.trim()) {
    const qTrimmed = filters.q.trim();
    where.OR = [
      { jiraKey: { contains: qTrimmed, mode: "insensitive" } },
      { summary: { contains: qTrimmed, mode: "insensitive" } },
    ];
  }

  const rawAssignees = filters.assignees;
  const isAll =
    !rawAssignees ||
    rawAssignees === "ALL" ||
    (Array.isArray(rawAssignees) &&
      (rawAssignees.length === 0 || rawAssignees.some((a) => a.toLowerCase() === "all")));

  if (!isAll && Array.isArray(rawAssignees)) {
    const tokens = rawAssignees.map((a) => a.trim()).filter(Boolean);
    const hasUnassigned = tokens.some(
      (a) => a.toLowerCase() === "unassigned" || a.toLowerCase() === "none"
    );
    const namedTokens = tokens
      .filter((a) => a.toLowerCase() !== "unassigned" && a.toLowerCase() !== "none")
      .map((a) => (a.toLowerCase() === "me" && jiraUsername ? jiraUsername : a));

    if (namedTokens.length > 0 && hasUnassigned) {
      const assigneeConditions: Prisma.IssueCacheWhereInput[] = [
        { assigneeJira: { in: namedTokens } },
        { assigneeJira: null },
        { assigneeJira: "" },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: assigneeConditions }];
        delete where.OR;
      } else {
        where.OR = assigneeConditions;
      }
    } else if (namedTokens.length > 0) {
      where.assigneeJira = { in: namedTokens };
    } else if (hasUnassigned) {
      const unassignedConditions: Prisma.IssueCacheWhereInput[] = [
        { assigneeJira: null },
        { assigneeJira: "" },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: unassignedConditions }];
        delete where.OR;
      } else {
        where.OR = unassignedConditions;
      }
    }
  }

  const hasEpicFilter = Boolean(filters.epics && filters.epics.length > 0);

  const rows = await prisma.issueCache.findMany({
    where,
    select: { jiraKey: true, ...(hasEpicFilter ? { raw: true } : {}) },
    orderBy: { jiraKey: "asc" },
    take: maxKeys,
  });

  if (hasEpicFilter && filters.epics) {
    const epicTokens = filters.epics.map((e) => e.trim().toLowerCase());
    const hasUnassigned = epicTokens.some((e) => e === "none" || e === "unassigned");
    const namedEpics = epicTokens.filter((e) => e !== "none" && e !== "unassigned");

    const matched = rows.filter((row) => {
      const epic = extractEpicKey((row as { raw?: unknown }).raw);
      if (!epic) return hasUnassigned;
      return namedEpics.includes(epic.toLowerCase());
    });
    return matched.map((r) => r.jiraKey);
  }

  return rows.map((r) => r.jiraKey);
}

// BULK-009 — reasons a transition could not be resolved. Only `no_transition`
// means "no path to this status"; the rest are upstream problems with distinct
// retryability (auth is not retryable, rate/unavailable are).
export type TransitionErrorKind =
  | "no_transition"
  | "auth_error"
  | "rate_limited"
  | "upstream_unavailable"
  | "unverified";

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

export function normalizeKey(k: string): string {
  return k.trim().toUpperCase();
}

/**
 * BULK-007 — freshness is about the age of the *cache snapshot*, not the age of
 * the issue. `lastSyncedAt` is when we last read the row from Jira; `updatedAt`
 * is when Jira last mutated the issue (an old value is normal and means nothing
 * about staleness). Only the cache age is a staleness signal.
 */
export function isStale(lastSyncedAt: Date, now: Date): boolean {
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

export function classifyAction(
  action: BulkAction,
  issue: IssueRow,
  ctx: { transitionName?: string | null; branchName?: string | null; branchExists?: boolean; fieldAvailable?: boolean }
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
  ctx: { transitionName?: string | null; branchName?: string | null; branchExists?: boolean; fieldAvailable?: boolean }
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
 * M4-02 — Preview a bulk action. Reads each issue from the cache (and, for
 * transitions, verifies a matching transition exists), computes before/after,
 * and persists a `preview` operation. Performs NO mutation.
 */
type TransitionGetter = {
  getTransitions: (key: string) => Promise<{ to?: { name?: string } }[]>;
  getEditMeta?: (key: string) => Promise<{ fields: Record<string, { name: string; allowedValues?: { id?: string; name?: string }[] }> }>;
  resolvePointsField?: (key: string) => Promise<{ id: string; name: string } | null>;
  resolveVersionId?: (projectKey: string, name: string) => Promise<string | null>;
};

export async function previewBulk(
  action: BulkAction,
  keys: string[],
  requestedBy: string,
  jira: TransitionGetter,
  bitbucketCreds: BbCreds | null = null,
  options?: { selector?: BulkSelector; maxKeys?: number }
): Promise<PreviewResult> {
  const limit = options?.maxKeys ?? (options?.selector?.mode === "filter" ? MAX_FILTER_KEYS : MAX_KEYS);
  const unique = Array.from(new Set(keys.map(normalizeKey))).slice(0, limit);
  if (unique.length === 0) throw new Error("no_keys");

  const isFixVersionAction = action.kind === "add-fix-version" || action.kind === "remove-fix-version";
  const scope: DependencyScope = isFixVersionAction ? (action.dependencyScope ?? "recursive") : "none";

  type Target = {
    key: string;
    relation: "explicit" | "dependency";
    depth: number;
    via?: string;
    rootKey?: string;
  };

  let targets: Target[] = unique.map((k) => ({
    key: k,
    relation: "explicit",
    depth: 0,
    rootKey: k,
  }));

  let cycles: Array<{ path: string[] }> = [];
  let truncated = false;

  if (scope !== "none") {
    const depGraph = await expandDependencies({
      rootKeys: unique,
      maxDepth: scope === "direct" ? 1 : env.jiraDependencyMaxDepth,
      maxIssues: MAX_KEYS,
    });
    targets = depGraph.issues.map((i) => ({
      key: i.key,
      relation: i.relation,
      depth: i.depth,
      via: i.via,
      rootKey: i.rootKey ?? i.key,
    }));
    cycles = depGraph.cycles;
    truncated = depGraph.truncated;
  }

  const allTargetKeys = Array.from(new Set(targets.map((t) => t.key)));
  const issues = await prisma.issueCache.findMany({
    where: { jiraKey: { in: allTargetKeys }, deletedAt: null },
  });
  const byKey = new Map(issues.map((i) => [i.jiraKey, i]));
  if (action.kind === "update-fields") {
    const projects = new Set(issues.map((issue) => issue.projectKey));
    if (projects.size > 1) throw new Error("bulk_field_update_requires_single_project");
  }

  const items: (PreviewItem & { skipReason: string | null })[] = [];
  let actionable = 0;
  let skipped = 0;
  let externalCount = 0;
  let dependencyCount = 0;

  for (const target of targets) {
    const key = target.key;
    const isDep = target.relation === "dependency";
    if (isDep) dependencyCount++;

    const issue = byKey.get(key);
    const rootKey = target.rootKey ?? key;
    const rootIssue = byKey.get(rootKey);
    const rootProject = rootIssue?.projectKey || rootKey.split("-")[0];
    const depProject = issue?.projectKey || key.split("-")[0];
    const sameProject = Boolean(rootProject && depProject && rootProject === depProject);

    if (!issue) {
      // BULK-002 — mark as skipped at preview time; the worker never runs it.
      skipped++;
      items.push({
        jiraKey: key,
        before: {},
        after: {},
        warning: "not_in_cache",
        transitionName: null,
        transitionError: null,
        branchName: null,
        targetField: null,
        targetVersionId: null,
        exists: false,
        skipReason: "not_in_cache",
        relation: target.relation,
        depth: target.depth,
        via: target.via,
        rootKey: target.rootKey,
        projectKey: depProject,
        sameProject,
      });
      continue;
    }

    let transitionName: string | null = null;
    let transitionError: TransitionErrorKind | null = null;
    let branchName: string | null = null;
    let branchExists: boolean | undefined;
    let targetField: { id: string; name: string } | null = null;
    let targetVersionId: string | null = null;
    let fieldAvailable: boolean | undefined;
    let fieldWarning: string | null = null;
    let fieldSkipReason: string | null = null;

    if (action.kind === "update-fields") {
      const { value } = action;
      if (value.points !== undefined) {
        try {
          targetField = (await jira.resolvePointsField?.(key)) ?? null;
          if (!targetField) {
            fieldAvailable = false;
            fieldSkipReason = "field_unavailable";
          }
        } catch {
          fieldAvailable = false;
          fieldWarning = "field_metadata_unavailable";
          fieldSkipReason = "field_unavailable";
        }
      }

      if (
        fieldAvailable !== false &&
        jira.getEditMeta &&
        (value.issueType !== undefined || value.estimate !== undefined || value.dueDate !== undefined || value.fixVersions !== undefined || value.epic !== undefined)
      ) {
        try {
          const meta = await jira.getEditMeta(key);
          if (value.issueType !== undefined) {
            const issueTypeField = meta.fields?.issuetype;
            const allowed = issueTypeField?.allowedValues;
            if (!issueTypeField || (allowed?.length && !allowed.some((type) => type.name === value.issueType))) {
              fieldAvailable = false;
              fieldSkipReason = "field_unavailable";
            }
          }
          if (value.estimate !== undefined && !meta.fields?.timetracking) {
            fieldAvailable = false;
            fieldSkipReason = "field_unavailable";
          }
          if (value.dueDate !== undefined && !meta.fields?.duedate) {
            fieldAvailable = false;
            fieldSkipReason = "field_unavailable";
          }
          if (value.fixVersions !== undefined) {
            if (!meta.fields?.fixVersions) {
              fieldAvailable = false;
              fieldSkipReason = "field_unavailable";
            } else if (jira.resolveVersionId && value.fixVersions.length > 0) {
              const ids = await Promise.all(
                value.fixVersions.map((v) => jira.resolveVersionId!(issue.projectKey, v))
              );
              if (ids.some((id) => id == null)) {
                fieldAvailable = false;
                fieldSkipReason = "version_not_found";
              }
            }
          }
          if (value.epic !== undefined && value.epic !== null) {
            const hasEpicField = Object.entries(meta.fields ?? {}).some(([id, f]) => {
              const fieldWithSchema = f as { name?: string; schema?: { custom?: string } };
              const lowerName = fieldWithSchema.name?.trim().toLowerCase() ?? "";
              return (
                id === "parent" ||
                lowerName === "epic link" ||
                lowerName === "epic" ||
                fieldWithSchema.schema?.custom === "com.pyxis.greenhopper.jira:gh-epic-link"
              );
            });
            if (!hasEpicField && !meta.fields?.parent) {
              fieldAvailable = false;
              fieldSkipReason = "field_unavailable";
            }
          }
        } catch {
          fieldAvailable = false;
          fieldWarning = "field_metadata_unavailable";
          fieldSkipReason = "field_unavailable";
        }
      }
    }

    if (action.kind === "set-epic" && action.value) {
      if (jira.getEditMeta) {
        try {
          const meta = await jira.getEditMeta(key);
          const hasEpicField = Object.entries(meta.fields ?? {}).some(([id, f]) => {
            const fieldWithSchema = f as { name?: string; schema?: { custom?: string } };
            const lowerName = fieldWithSchema.name?.trim().toLowerCase() ?? "";
            return (
              id === "parent" ||
              lowerName === "epic link" ||
              lowerName === "epic" ||
              fieldWithSchema.schema?.custom === "com.pyxis.greenhopper.jira:gh-epic-link"
            );
          });
          if (!hasEpicField && !meta.fields?.parent) {
            fieldAvailable = false;
            fieldSkipReason = "field_unavailable";
          }
        } catch {
          fieldAvailable = false;
          fieldWarning = "field_metadata_unavailable";
        }
      }
    }

    if (action.kind === "set-points") {
      try {
        targetField = await jira.resolvePointsField?.(key) ?? null;
        fieldAvailable = targetField != null;
      } catch {
        fieldAvailable = false;
        fieldWarning = "field_metadata_unavailable";
      }
    }

    if (action.kind === "set-estimate" || action.kind === "set-due-date") {
      try {
        const meta = await jira.getEditMeta?.(key);
        const fieldId = action.kind === "set-estimate" ? "timetracking" : "duedate";
        const field = meta?.fields?.[fieldId];
        targetField = field ? { id: fieldId, name: field.name } : null;
        fieldAvailable = targetField != null;
      } catch {
        fieldAvailable = false;
        fieldWarning = "field_metadata_unavailable";
      }
    }

    if (
      (action.kind === "add-fix-version" || action.kind === "remove-fix-version") &&
      jira.getEditMeta &&
      jira.resolveVersionId
    ) {
      try {
        const [meta, versionId] = await Promise.all([
          jira.getEditMeta(key),
          jira.resolveVersionId(issue.projectKey, action.value),
        ]);
        const field = meta.fields?.fixVersions;
        targetField = field ? { id: "fixVersions", name: field.name } : null;
        targetVersionId = versionId;
        fieldAvailable = Boolean(field && versionId);
        if (!field) fieldSkipReason = "field_unavailable";
        else if (!versionId) fieldSkipReason = "version_not_found";
      } catch {
        fieldAvailable = false;
        fieldWarning = "field_metadata_unavailable";
        fieldSkipReason = "version_unverified";
      }
    }

    if (action.kind === "transition") {
      try {
        const transitions = await jira.getTransitions(key);
        const targetStatus = action.value.toLowerCase();
        const match = transitions.find((t) => t.to?.name?.toLowerCase() === targetStatus);
        transitionName = match?.to?.name ?? null;
      } catch (e) {
        // BULK-009 — distinguish upstream failures from a genuine missing path.
        transitionError = isTransitionError(e) ?? "unverified";
        transitionName = null;
      }
    }

    if (action.kind === "create-branches") {
      if (!bitbucketCreds) throw new Error("bitbucket_credentials_required");
      const repo = action.value.repo ?? bitbucketRepoList[0] ?? "";
      const template = action.value.nameTemplate ?? DEFAULT_BRANCH_TEMPLATE;
      branchName = renderBranchName(template, key, issue.status);
      try {
        const existing = await bitbucket.getBranch(repo, branchName, bitbucketCreds);
        branchExists = existing != null;
      } catch {
        // Could not check (no bitbucket config / network). Leave unknown.
      }
    }

    const issueRow: IssueRow = {
      jiraKey: key,
      projectKey: issue.projectKey,
      status: issue.status,
      assigneeJira: issue.assigneeJira,
      labels: issue.labels,
      fixVersionIds: issue.fixVersionIds,
      fixVersionNames: issue.fixVersionNames,
      priority: issue.priority,
      type: issue.type,
      points: issue.points,
      dueDate: issue.dueDate,
      originalEstimateSeconds:
        typeof (issue.raw as Record<string, unknown> | null)?.timeoriginalestimate === "number"
          ? Number((issue.raw as Record<string, unknown>).timeoriginalestimate)
          : null,
      timeSpentSeconds: issue.timeSpent,
      updatedAt: issue.updatedAt,
      lastSyncedAt: issue.lastSyncedAt,
    };
    const ctx = { transitionName, branchName, branchExists, fieldAvailable };
    const preview = computePreview(action, issueRow, ctx);

    // BULK-005/009 — no-op and blocked/unverified items are skipped, not run.
    let skipReason: string | null = null;
    let warning = fieldWarning ?? preview.warning;

    if (preview.classification === "no_change") skipReason = "no_change";
    else if (preview.classification === "blocked")
      skipReason = fieldSkipReason ?? (fieldAvailable === false ? "field_unavailable" : transitionError ?? "no_transition");
    else if (preview.classification === "unverified") skipReason = "unverified";

    // Dependency specific rules (DEP-06, DEP-07, DEP-08)
    if (isDep) {
      if (!sameProject) {
        // External project dependency: do NOT mutate in Jira!
        skipReason = "external_dependency";
        warning = "external_dependency";
        externalCount++;
      } else if (action.kind === "remove-fix-version" && !action.forceRemove) {
        // Provenance check for safe removal
        const prop = await prisma.fixVersionPropagation.findFirst({
          where: {
            rootKey,
            dependencyKey: key,
            active: true,
          },
        });
        if (!prop) {
          // Version was not propagated by app from this root
          skipReason = "manual_or_unpropagated";
        } else {
          // Check if another root also references this dependency for the same version
          const otherProp = await prisma.fixVersionPropagation.findFirst({
            where: {
              dependencyKey: key,
              jiraVersionId: prop.jiraVersionId,
              active: true,
              rootKey: { not: rootKey },
            },
          });
          if (otherProp) {
            skipReason = "shared_with_other_root";
          }
        }
      }
    }

    if (skipReason) skipped++;
    else actionable++;

    items.push({
      jiraKey: key,
      before: preview.before,
      after: skipReason ? preview.before : preview.after,
      warning,
      transitionName,
      transitionError,
      branchName,
      targetField,
      targetVersionId,
      exists: branchExists === true,
      skipReason,
      relation: target.relation,
      depth: target.depth,
      via: target.via,
      rootKey: target.rootKey,
      projectKey: depProject,
      sameProject,
    });
  }

  const op = await prisma.bulkOperation.create({
    data: {
      type: action.kind,
      requestedBy,
      payload: {
        action,
        params: actionParams(action),
        cycles,
        truncated,
        ...(options?.selector ? { selector: options.selector } : {}),
      } as Prisma.InputJsonValue,
      state: "preview",
      total: targets.length,
    },
  });

  await prisma.bulkOperationItem.createMany({
    data: items.map((item) => ({
      operationId: op.id,
      jiraKey: item.jiraKey,
      before: item.before as Prisma.InputJsonValue,
      after: item.after as Prisma.InputJsonValue,
      requested: {
        transitionName: item.transitionName,
        transitionError: item.transitionError,
        branchName: item.branchName,
        targetField: item.targetField,
        targetVersionId: item.targetVersionId,
        warning: item.warning,
        skipReason: item.skipReason,
        relation: item.relation,
        depth: item.depth,
        via: item.via,
        rootKey: item.rootKey,
        projectKey: item.projectKey,
        sameProject: item.sameProject,
      } as Prisma.InputJsonValue,
      // BULK-002 — skipped items are persisted as `skipped` so the worker never
      // picks them up; only actionable items are created as `pending`.
      status: item.skipReason ? "skipped" : "pending",
      error: item.skipReason ?? null,
    })),
  });

  return {
    operationId: op.id,
    type: action.kind,
    total: targets.length,
    items,
    actionable,
    skipped,
    cycles,
    truncated,
    selectedCount: unique.length,
    dependencyCount,
    externalCount,
  };
}

/**
 * M4-02 — Confirm a preview and enqueue it. The caller must pass the exact
 * operation id from the preview (this is the "confirm by operation id" guard
 * that prevents accidental mutation).
 */
export async function confirmBulk(
  operationId: string,
  requestedBy: string
): Promise<{ operationId: string; total: number; actionable: number; skipped: number }> {
  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    include: { items: true },
  });
  if (!op || op.requestedBy !== requestedBy) {
    throw new Error("not_found");
  }
  if (op.state !== "preview") {
    throw new Error("already_confirmed");
  }

  // BULK-002 — counts are derived from the persisted item statuses, not
  // re-derived from warning strings, so preview and execution stay in sync.
  const skipped = op.items.filter((i) => i.status === "skipped").length;
  const actionable = op.total - skipped;

  await prisma.bulkOperation.update({
    where: { id: op.id },
    data: { state: "queued", startedAt: new Date() },
  });

  return { operationId: op.id, total: op.total, actionable, skipped };
}

/** Mark a preview as cancelled without executing it. */
export async function cancelBulk(operationId: string, requestedBy: string): Promise<void> {
  await prisma.bulkOperation.updateMany({
    where: { id: operationId, requestedBy, state: "preview" },
    data: { state: "cancelled" },
  });
}

// ---------------------------------------------------------------------------
// Execution (M4-03 / M4-04)
// ---------------------------------------------------------------------------

export type OpAuth = {
  jira: JiraAuth | null;
  bitbucket: BbCreds | null;
};

type OpRow = {
  id: string;
  type: string;
  requestedBy: string;
  payload: { action: BulkAction; params: ActionParams };
  state: string;
  startedAt: Date | null;
};

type Ctx = {
  op: OpRow;
  auth: OpAuth;
  concurrency: number;
};

type ItemResult = {
  status: "succeeded" | "failed" | "skipped";
  error?: string;
  retryable?: boolean;
};

async function getIssue(client: ReturnType<typeof jiraWith>, key: string): Promise<JiraIssue> {
  return client.getIssue(key, jiraIssueFields());
}

async function applyItem(ctx: Ctx, key: string): Promise<ItemResult> {
  const action = ctx.op.payload as { action: BulkAction };
  const { action: a } = action;
  if (!ctx.auth.jira) {
    return { status: "failed", error: "Jira credentials required", retryable: false };
  }
  const jira = jiraWith(ctx.auth.jira);
  const bb = ctx.auth.bitbucket;

  try {
    switch (a.kind) {
      case "update-fields": {
        const issue = await getIssue(jira, key);
        const patch: {
          assignee?: string | null; labels?: string[]; priority?: string; issueType?: string; points?: number | null;
          fixVersions?: string[]; dueDate?: string | null; originalEstimate?: string; epic?: string | null;
        } = {};
        if (a.value.assignee !== undefined) patch.assignee = a.value.assignee;
        if (a.value.labels !== undefined) patch.labels = a.value.labels;
        if (a.value.priority !== undefined) patch.priority = a.value.priority;
        if (a.value.issueType !== undefined) patch.issueType = a.value.issueType;
        if (a.value.points !== undefined) patch.points = a.value.points;
        if (a.value.dueDate !== undefined) patch.dueDate = a.value.dueDate;
        if (a.value.estimate !== undefined) patch.originalEstimate = a.value.estimate;
        if (a.value.epic !== undefined) patch.epic = a.value.epic;
        if (a.value.fixVersions !== undefined) {
          const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
          if (a.value.fixVersions.length === 0) {
            patch.fixVersions = [];
          } else {
            const ids = await Promise.all(a.value.fixVersions.map((name) => jira.resolveVersionId(projectKey, name)));
            if (ids.some((id) => id == null)) return { status: "failed", error: "One or more Fix Versions do not exist in this project", retryable: false };
            patch.fixVersions = ids.filter((id): id is string => id != null);
          }
        }
        await jira.updateIssue(key, patch);
        break;
      }
      case "set-epic": {
        await jira.updateIssue(key, { epic: a.value });
        break;
      }
      case "assign": {
        await jira.updateIssue(key, { assignee: a.value });
        break;
      }
      case "add-labels": {
        const issue = await getIssue(jira, key);
        const merged = Array.from(new Set([...(issue.fields.labels ?? []), ...(a.value ?? [])]));
        await jira.updateIssue(key, { labels: merged });
        break;
      }
      case "remove-labels": {
        const issue = await getIssue(jira, key);
        const drop = new Set(a.value ?? []);
        const kept = (issue.fields.labels ?? []).filter((l) => !drop.has(l));
        await jira.updateIssue(key, { labels: kept });
        break;
      }
      case "set-points": {
        await jira.updateIssue(key, { points: a.value });
        break;
      }
      case "set-estimate": {
        const meta = await jira.getEditMeta(key);
        if (!meta.fields?.timetracking) {
          return {
            status: "failed",
            error: "Time Tracking is not editable for this Jira issue. Add it to the issue edit screen.",
            retryable: false,
          };
        }
        await jira.updateIssue(key, { originalEstimate: a.value });
        break;
      }
      case "log-work": {
        const started = a.value.started
          ? formatJiraStartedAt(a.value.started)
          : undefined;
        await jira.addWorklog(
          key,
          { timeSpent: a.value.timeSpent, started, comment: a.value.comment },
          "leave"
        );
        break;
      }
      case "set-due-date": {
        const meta = await jira.getEditMeta(key);
        if (!meta.fields?.duedate) {
          return { status: "failed", error: "Due Date is not editable for this Jira issue", retryable: false };
        }
        await jira.updateIssue(key, { dueDate: a.value });
        break;
      }
      case "set-priority": {
        await jira.updateIssue(key, { priority: a.value });
        break;
      }
      case "transition": {
        const t = await jira.findTransition(key, a.value);
        if (!t) {
          return { status: "failed", error: `No transition to "${a.value}"`, retryable: false };
        }
        await jira.transition(key, t.id);
        break;
      }
      case "add-fix-version": {
        const issue = await getIssue(jira, key);
        const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
        const id = await jira.resolveVersionId(projectKey, a.value);
        if (!id) {
          return { status: "failed", error: `Version "${a.value}" not found`, retryable: false };
        }
        const current = (issue.fields.fixVersions ?? []).map((v) => v.id ?? "").filter(Boolean);
        if (!current.includes(id)) {
          await jira.updateIssue(key, { fixVersions: [...current, id] });
        }

        // Provenance tracking & audit (DEP-07, DEP-12)
        const itemRow = await prisma.bulkOperationItem.findUnique({
          where: { operationId_jiraKey: { operationId: ctx.op.id, jiraKey: key } },
          select: { requested: true },
        });
        const reqMeta = itemRow?.requested as Record<string, unknown> | null;
        if (reqMeta?.relation === "dependency" && reqMeta.rootKey) {
          const rootKey = String(reqMeta.rootKey);
          await prisma.fixVersionPropagation.upsert({
            where: {
              rootKey_dependencyKey_jiraVersionId: {
                rootKey,
                dependencyKey: key,
                jiraVersionId: id,
              },
            },
            create: {
              rootKey,
              dependencyKey: key,
              jiraVersionId: id,
              projectKey,
              operationId: ctx.op.id,
              active: true,
              appliedAt: new Date(),
            },
            update: {
              active: true,
              operationId: ctx.op.id,
              appliedAt: new Date(),
              removedAt: null,
            },
          });

          await audit({
            actorId: ctx.op.requestedBy,
            action: "issue.fix_version.propagate",
            target: key,
            before: { fixVersions: current },
            after: { fixVersions: [...current, id], rootKey, versionId: id },
            source: "worker",
            correlationId: ctx.op.id,
          });
        }
        break;
      }
      case "remove-fix-version": {
        const issue = await getIssue(jira, key);
        const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
        const id = await jira.resolveVersionId(projectKey, a.value);
        if (id) {
          const current = (issue.fields.fixVersions ?? []).map((v) => v.id ?? "").filter((x) => x);
          const kept = current.filter((x) => x !== id);
          if (kept.length !== current.length) {
            await jira.updateIssue(key, { fixVersions: kept });

            // Provenance update & audit (DEP-08, DEP-12)
            await prisma.fixVersionPropagation.updateMany({
              where: {
                dependencyKey: key,
                jiraVersionId: id,
              },
              data: {
                active: false,
                removedAt: new Date(),
              },
            });

            await audit({
              actorId: ctx.op.requestedBy,
              action: "issue.fix_version.propagate_remove",
              target: key,
              before: { fixVersions: current },
              after: { fixVersions: kept, versionId: id },
              source: "worker",
              correlationId: ctx.op.id,
            });
          }
        }
        break;
      }
      case "add-comment": {
        const comment = await jira.addComment(key, a.value);
        await notifyWatchersOfComment(key, comment.author?.name ?? comment.author?.displayName ?? "User", a.value, comment.id)
          .catch(() => null);
        break;
      }
      case "create-branches": {
        if (!bb) {
          return { status: "failed", error: "Bitbucket credentials required", retryable: false };
        }
        const result = await createBranchForIssue(jira, key, a.value, bb);
        if (result.error) {
          return { status: "failed", error: result.error, retryable: result.retryable ?? true };
        }
        break;
      }
      default:
        return { status: "failed", error: "unknown action", retryable: false };
    }

    // Update the local cache after a successful mutation so the board reflects
    // the change immediately. Best-effort: a refresh failure is not fatal.
    await refreshJiraIssueCache(jira, key);

    return { status: "succeeded" };
  } catch (e) {
    if (a.kind === "log-work") {
      const isTimeout =
        e instanceof JiraRequestError && (e.status === null || e.status === 408 || e.status === 504);
      if (isTimeout) {
        return {
          status: "failed",
          error: "Jira timeout: outcome_unknown to prevent duplicate worklog",
          retryable: false,
        };
      }
    }
    const retryable = e instanceof JiraRequestError ? e.retryable : false;
    return { status: "failed", error: (e as Error).message.slice(0, 400), retryable };
  }
}

export async function createBranchForIssue(
  jira: ReturnType<typeof jiraWith>,
  key: string,
  params: BranchParams,
  creds: BbCreds
): Promise<{ error?: string; retryable?: boolean; branch?: string; repo?: string }> {
  const repo = params.repo ?? bitbucketRepoList[0];
  if (!repo) return { error: "No Bitbucket repository configured", retryable: false };
  const base = params.base ?? env.bitbucketBaseBranch;
  const template = params.nameTemplate ?? DEFAULT_BRANCH_TEMPLATE;

  // We need the current status for the template — read from cache first.
  const cached = await prisma.issueCache.findUnique({
    where: { jiraKey: key },
    select: { status: true },
  });
  const branchName = renderBranchName(template, key, cached?.status ?? "task");

  // Idempotency: skip if the branch already exists.
  const existing = await bitbucket.getBranch(repo, branchName, creds);
  if (existing) {
    await linkBranch(key, repo, branchName);
    return { branch: branchName, repo };
  }

  await bitbucket.createBranch(repo, { name: branchName, base }, creds);
  await linkBranch(key, repo, branchName);

  // Optional: comment the branch link back onto the Jira issue.
  if (params.comment === true) {
    const repoUrl = `${env.bitbucketBaseUrl.replace(/\/$/, "")}/${repo}`;
    const comment = `Branch created: [${branchName}](${repoUrl}/src/branch/${encodeURIComponent(branchName)}) (base: ${base})`;
    const created = await jira.addComment(key, comment).catch(() => null);
    if (created) {
      await notifyWatchersOfComment(key, created.author?.name ?? created.author?.displayName ?? "User", comment, created.id)
        .catch(() => null);
    }
  }

  return { branch: branchName, repo };
}

/** Record the issue↔branch relationship (BranchInfo.jiraKey) explicitly. */
async function linkBranch(
  jiraKey: string,
  repo: string,
  branch: string
): Promise<void> {
  await recordExplicitBranchLink(repo, branch, jiraKey);
}

function isTerminal(state: string): boolean {
  return ["completed", "partially_failed", "failed", "cancelled"].includes(state);
}

/**
 * M4-03 — Execute a confirmed operation. Processes pending items with a
 * bounded concurrency, retries transient failures in place, and updates the
 * cache after each item. Succeeded items are never re-run (idempotency across
 * retries).
 */
export async function executeBulkOperation(operationId: string): Promise<void> {
  const op = await prisma.bulkOperation.findUnique({ where: { id: operationId } });
  if (!op) return;
  if (isTerminal(op.state)) return;

  // Atomically claim the operation. Only the winner of a queued→running
  // transition proceeds; concurrent invocations (double-enqueue, retry racing a
  // still-running job) lose the race and exit without re-processing items.
  const claim = await prisma.bulkOperation.updateMany({
    where: { id: op.id, state: "queued" },
    data: { state: "running", startedAt: op.startedAt ?? new Date() },
  });
  if (claim.count === 0) return;

  const requested = await prisma.user.findUnique({
    where: { id: op.requestedBy },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      bitbucketUserEnc: true,
      bitbucketTokenEnc: true,
    },
  });

  const auth: OpAuth = {
    jira: userJiraAuth(requested),
    bitbucket: userBitbucketCreds(requested),
  };

  const concurrency = Math.max(1, Math.min(8, env.bulkConcurrency));

  // BULK-002 — only `pending` (actionable) items are run. Items already marked
  // `skipped` at preview time are never touched here.
  const pending = await prisma.bulkOperationItem.findMany({
    where: { operationId, status: "pending" },
    orderBy: { jiraKey: "asc" },
  });

  // Simple bounded pool: `concurrency` workers drain the pending list.
  const queue = [...pending];
  const runners = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await processWithRetry(operationId, item.id, item.jiraKey, auth, concurrency);
      }
    }
  );
  await Promise.all(runners);

  // BULK-003 — aggregate counters from the database, not from the in-process
  // results. This stays correct across retries (items that succeeded in an
  // earlier pass are counted) and matches what the DB actually holds.
  const counts = await prisma.bulkOperationItem.groupBy({
    by: ["status"],
    where: { operationId },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  const succeeded = byStatus.succeeded ?? 0;
  const failed = byStatus.failed ?? 0;
  const skipped = byStatus.skipped ?? 0;
  const stillPending = (byStatus.pending ?? 0) + (byStatus.running ?? 0);
  const terminal = stillPending === 0;

  // Only flip to a terminal state once every item has a final status.
  const state = !terminal ? op.state : failed === 0 ? "completed" : "partially_failed";

  await prisma.bulkOperation.update({
    where: { id: op.id },
    data: {
      state,
      succeeded,
      failed,
      completedAt: terminal ? new Date() : undefined,
    },
  });

  if (terminal) await notifyResult(op, state, succeeded, failed, skipped);
}

const MAX_ATTEMPTS = 3;

async function processWithRetry(
  operationId: string,
  itemId: string,
  key: string,
  auth: OpAuth,
  _concurrency: number
): Promise<ItemResult> {
  const opRow = await prisma.bulkOperation.findUnique({ where: { id: operationId } });
  if (!opRow) return { status: "skipped" };

  // Idempotency guard: never re-run an item that already succeeded.
  const current = await prisma.bulkOperationItem.findUnique({ where: { id: itemId } });
  if (current?.status === "succeeded") return { status: "succeeded" };

  const op: OpRow = {
    id: opRow.id,
    type: opRow.type,
    requestedBy: opRow.requestedBy,
    payload: opRow.payload as { action: BulkAction; params: ActionParams },
    state: opRow.state,
    startedAt: opRow.startedAt,
  };
  const ctx: Ctx = { op, auth, concurrency: _concurrency };

  await prisma.bulkOperationItem.update({
    where: { id: itemId },
    data: { status: "running" },
  });

  let result: ItemResult = { status: "failed", error: "not attempted", retryable: true };
  let attempts = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // BULK-012 — count every real attempt, not just the final pass.
    attempts++;
    result = await applyItem(ctx, key);
    if (result.status === "succeeded" || result.status === "skipped") break;
    if (!result.retryable) break;
    if (attempt < MAX_ATTEMPTS) {
      // Short backoff between attempts.
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  const finalStatus = result.status;
  const after =
    result.status === "succeeded"
      ? await prisma.issueCache.findUnique({
          where: { jiraKey: key },
          select: {
            status: true,
            assigneeJira: true,
            labels: true,
            priority: true,
            points: true,
            fixVersionNames: true,
          },
        })
      : null;

  await prisma.bulkOperationItem.update({
    where: { id: itemId },
    data: {
      status: finalStatus,
      error: result.error ?? null,
      retryable: result.retryable ?? false,
      attemptCount: { increment: attempts },
      after: (after ?? undefined) as Prisma.InputJsonValue,
    },
  });

  return { status: finalStatus, error: result.error };
}

async function notifyResult(
  op: { requestedBy: string; type: string; id: string },
  state: string,
  succeeded: number,
  failed: number,
  skipped: number
): Promise<void> {
  try {
    const { notifyUser } = await import("@/lib/notify");
    const statusText =
      state === "completed"
        ? "hoàn tất"
        : state === "partially_failed"
          ? "thất bại một phần"
          : "thất bại";
    const severity = state === "completed" ? "info" : state === "partially_failed" ? "warning" : "danger";
    await notifyUser(op.requestedBy, {
      type: "system",
      title: `Thao tác hàng loạt ${op.type} ${statusText}`,
      body: `${succeeded} thành công, ${failed} thất bại, ${skipped} bỏ qua.`,
      link: `/bulk?operation=${op.id}`,
      severity,
      eventKey: `bulk:${op.id}:${state}`,
    });
  } catch {
    /* ignore notification errors */
  }
}
