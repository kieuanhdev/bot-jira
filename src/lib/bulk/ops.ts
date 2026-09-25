import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, bitbucketRepoList } from "@/lib/env";
import { jiraWith, jiraIssueFields, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import { bitbucket, type BbCreds } from "@/lib/bitbucket/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import type { JiraIssue } from "@/lib/jira/types";
import { userJiraAuth, userBitbucketCreds } from "@/lib/user-creds";
import { renderBranchName } from "./branch-name";
import { recordExplicitBranchLink } from "@/lib/bitbucket/link-service";
import { expandDependencies } from "@/lib/issues/dependencies";
import { audit } from "@/lib/audit";

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

export type BulkAction =
  | { kind: "assign"; value: string | null }
  | { kind: "add-labels"; value: string[] }
  | { kind: "remove-labels"; value: string[] }
  | { kind: "set-points"; value: number | null }
  | { kind: "set-priority"; value: string }
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

const DEFAULT_BRANCH_TEMPLATE = env.bulkBranchTemplate || "{project}-{number}";
export const MAX_KEYS = 500;

type IssueRow = {
  jiraKey: string;
  projectKey: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersionIds: string[];
  fixVersionNames: string[];
  priority: string;
  points: number | null;
  updatedAt: Date | null;
  lastSyncedAt: Date;
};

type ActionParams = {
  assignee?: string | null;
  labels?: string[];
  priority?: string;
  points?: number | null;
  status?: string;
  fixVersion?: string;
  comment?: string;
  branches?: BranchParams;
};

export function actionParams(action: BulkAction): ActionParams {
  switch (action.kind) {
    case "assign":
      return { assignee: action.value };
    case "add-labels":
    case "remove-labels":
      return { labels: action.value };
    case "set-points":
      return { points: action.value };
    case "set-priority":
      return { priority: action.value };
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
  "assign",
  "add-labels",
  "remove-labels",
  "set-points",
  "set-priority",
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

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type ValidationResult = { ok: true; keys: string[]; action: BulkAction } | { ok: false; errors: string[] };

/**
 * Validate a bulk request body. Returns normalized keys (trimmed, uppercased,
 * deduplicated) and a validated action, or a list of field errors. Empty keys
 * after normalization are rejected rather than silently producing nothing, and
 * the list must not exceed MAX_KEYS.
 */
export function validateBulkRequest(body: unknown): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, errors: ["request body must be an object"] };

  const rawKeys = body.keys;
  const rawAction = body.action;

  if (!Array.isArray(rawKeys)) return { ok: false, errors: ["keys must be an array"] };

  const errors: string[] = [];

  const keys = rawKeys
    .filter((k): k is string => typeof k === "string")
    .map(normalizeKey)
    .filter(Boolean);
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) errors.push("keys must contain at least one non-empty key");
  if (uniqueKeys.length > MAX_KEYS)
    errors.push(`too many keys: ${uniqueKeys.length} (max ${MAX_KEYS})`);

  let action: BulkAction | null = null;
  if (!isPlainObject(rawAction)) {
    errors.push("action must be an object");
  } else {
    const kind = rawAction.kind;
    if (typeof kind !== "string" || !(KNOWN_ACTION_KINDS as readonly string[]).includes(kind)) {
      errors.push(`unknown action kind: ${String(kind)}`);
    } else {
      switch (kind) {
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
  return { ok: true, keys: uniqueKeys, action };
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
  ctx: { transitionName?: string | null; branchName?: string | null; branchExists?: boolean }
): PreviewClassification {
  const p = actionParams(action);
  switch (action.kind) {
    case "assign":
      return (p.assignee ?? null) === issue.assigneeJira ? "no_change" : "will_change";
    case "add-labels":
      return (p.labels ?? []).some((l) => !issue.labels.includes(l)) ? "will_change" : "no_change";
    case "remove-labels":
      return (p.labels ?? []).some((l) => issue.labels.includes(l)) ? "will_change" : "no_change";
    case "set-points":
      return (p.points ?? null) === issue.points ? "no_change" : "will_change";
    case "set-priority":
      return p.priority === issue.priority ? "no_change" : "will_change";
    case "transition":
      if (ctx.transitionName == null) return "blocked";
      return p.status?.toLowerCase() === issue.status.toLowerCase() ? "no_change" : "will_change";
    case "add-fix-version":
      if (!p.fixVersion || issue.fixVersionNames.includes(p.fixVersion)) return "no_change";
      return "will_change";
    case "remove-fix-version":
      if (!p.fixVersion || !issue.fixVersionNames.includes(p.fixVersion)) return "no_change";
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
  ctx: { transitionName?: string | null; branchName?: string | null; branchExists?: boolean }
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
    points: issue.points,
    fixVersions: issue.fixVersionNames,
  };
  const after: Record<string, unknown> = { ...before };
  const warning = isStale(issue.lastSyncedAt, new Date()) ? "stale_data" : null;
  const classification = classifyAction(action, issue, ctx);

  const p = actionParams(action);
  switch (action.kind) {
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
    case "set-priority":
      after.priority = p.priority;
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
};

export async function previewBulk(
  action: BulkAction,
  keys: string[],
  requestedBy: string,
  jira: TransitionGetter,
  bitbucketCreds: BbCreds | null = null
): Promise<PreviewResult> {
  const unique = Array.from(new Set(keys.map(normalizeKey))).slice(0, MAX_KEYS);
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
      points: issue.points,
      updatedAt: issue.updatedAt,
      lastSyncedAt: issue.lastSyncedAt,
    };
    const ctx = { transitionName, branchName, branchExists };
    const preview = computePreview(action, issueRow, ctx);

    // BULK-005/009 — no-op and blocked/unverified items are skipped, not run.
    let skipReason: string | null = null;
    let warning = preview.warning;

    if (preview.classification === "no_change") skipReason = "no_change";
    else if (preview.classification === "blocked")
      skipReason = transitionError ?? "no_transition";
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
      payload: { action, params: actionParams(action), cycles, truncated } as Prisma.InputJsonValue,
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
        if (!env.jiraPointsFieldId) {
          return { status: "failed", error: "JIRA_POINTS_FIELD_ID not configured", retryable: false };
        }
        await jira.updateIssue(key, { points: a.value });
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
        await jira.addComment(key, a.value);
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
    const retryable = e instanceof JiraRequestError ? e.retryable : false;
    return { status: "failed", error: (e as Error).message.slice(0, 400), retryable };
  }
}

async function createBranchForIssue(
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
    await jira.addComment(key, comment).catch(() => null);
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
