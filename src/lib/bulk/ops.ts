import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, bitbucketRepoList } from "@/lib/env";
import { jiraWith, jiraIssueFields, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import { bitbucket, type BbCreds } from "@/lib/bitbucket/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import type { JiraIssue } from "@/lib/jira/types";
import { userJiraAuth, userBitbucketCreds } from "@/lib/user-creds";
import { renderBranchName } from "./branch-name";

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

export type BulkAction =
  | { kind: "assign"; value: string | null }
  | { kind: "add-labels"; value: string[] }
  | { kind: "remove-labels"; value: string[] }
  | { kind: "set-points"; value: number | null }
  | { kind: "set-priority"; value: string }
  | { kind: "transition"; value: string }
  | { kind: "add-fix-version"; value: string }
  | { kind: "remove-fix-version"; value: string }
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
const MAX_KEYS = 500;

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

type PreviewItem = {
  jiraKey: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warning: string | null;
  transitionName: string | null;
  branchName: string | null;
  exists: boolean; // for create-branches: branch already present
};

export type PreviewResult = {
  operationId: string;
  type: string;
  total: number;
  items: PreviewItem[];
  /** Count of items that will actually be acted on (excludes existing branches). */
  actionable: number;
};

function normalizeKey(k: string): string {
  return k.trim().toUpperCase();
}

function isStale(lastSyncedAt: Date, updatedAt: Date | null, now: Date): boolean {
  if (now.getTime() - lastSyncedAt.getTime() > env.jiraFreshnessMinutes * 60_000) return true;
  if (updatedAt && now.getTime() - updatedAt.getTime() > 24 * 60 * 60 * 1000) return true;
  return false;
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
): { before: Record<string, unknown>; after: Record<string, unknown>; warning: string | null } {
  const before: Record<string, unknown> = {
    status: issue.status,
    assignee: issue.assigneeJira,
    labels: issue.labels,
    priority: issue.priority,
    points: issue.points,
    fixVersions: issue.fixVersionNames,
  };
  const after: Record<string, unknown> = { ...before };
  let warning: string | null = isStale(issue.lastSyncedAt, issue.updatedAt, new Date())
    ? "stale_data"
    : null;

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
      if (ctx.transitionName == null) warning = "no_transition";
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
      if (ctx.branchExists) warning = "branch_exists";
      break;
  }
  return { before, after, warning };
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
  jira: TransitionGetter
): Promise<PreviewResult> {
  const unique = Array.from(new Set(keys.map(normalizeKey))).slice(0, MAX_KEYS);
  if (unique.length === 0) throw new Error("no_keys");

  const issues = await prisma.issueCache.findMany({
    where: { jiraKey: { in: unique } },
  });
  const byKey = new Map(issues.map((i) => [i.jiraKey, i]));

  const items: PreviewItem[] = [];
  let actionable = 0;

  for (const key of unique) {
    const issue = byKey.get(key);
    if (!issue) {
      items.push({
        jiraKey: key,
        before: {},
        after: {},
        warning: "not_in_cache",
        transitionName: null,
        branchName: null,
        exists: false,
      });
      continue;
    }

    let transitionName: string | null = null;
    let branchName: string | null = null;
    let branchExists: boolean | undefined;

    if (action.kind === "transition") {
      try {
        const transitions = await jira.getTransitions(key);
        const target = action.value.toLowerCase();
        const match = transitions.find((t) => t.to?.name?.toLowerCase() === target);
        transitionName = match?.to?.name ?? null;
      } catch {
        transitionName = null;
      }
    }

    if (action.kind === "create-branches") {
      const repo = action.value.repo ?? bitbucketRepoList[0] ?? "";
      const template = action.value.nameTemplate ?? DEFAULT_BRANCH_TEMPLATE;
      branchName = renderBranchName(template, key, issue.status);
      try {
        const existing = await bitbucket.getBranch(repo, branchName);
        branchExists = existing != null;
      } catch {
        // Could not check (no bitbucket config / network). Leave unknown.
      }
    }

    const preview = computePreview(action, {
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
    }, {
      transitionName,
      branchName,
      branchExists,
    });

    const willAct =
      action.kind === "create-branches"
        ? branchExists === false
        : !(preview.warning === "no_transition" || preview.warning === "not_in_cache");
    if (willAct) actionable++;

    items.push({
      jiraKey: key,
      before: preview.before,
      after: preview.after,
      warning: preview.warning,
      transitionName,
      branchName,
      exists: branchExists === true,
    });
  }

  const op = await prisma.bulkOperation.create({
    data: {
      type: action.kind,
      requestedBy,
      payload: { action, params: actionParams(action) } as Prisma.InputJsonValue,
      state: "preview",
      total: unique.length,
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
        branchName: item.branchName,
        warning: item.warning,
      } as Prisma.InputJsonValue,
      status: "pending",
    })),
  });

  return {
    operationId: op.id,
    type: action.kind,
    total: unique.length,
    items,
    actionable,
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
): Promise<{ operationId: string; total: number; actionable: number }> {
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

  const actionable = op.items.filter((i) => {
    const w = (i.requested as { warning?: string | null }).warning;
    if (w === "not_in_cache" || w === "no_transition") return false;
    if (w === "branch_exists") return false;
    return true;
  }).length;

  await prisma.bulkOperation.update({
    where: { id: op.id },
    data: { state: "queued", startedAt: new Date() },
  });

  return { operationId: op.id, total: op.total, actionable };
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
        break;
      }
      case "remove-fix-version": {
        const issue = await getIssue(jira, key);
        const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
        const id = await jira.resolveVersionId(projectKey, a.value);
        if (id) {
          const kept = (issue.fields.fixVersions ?? []).map((v) => v.id ?? "").filter((x) => x && x !== id);
          await jira.updateIssue(key, { fixVersions: kept });
        }
        break;
      }
      case "add-comment": {
        await jira.addComment(key, a.value);
        break;
      }
      case "create-branches": {
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
  creds: BbCreds | null
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

/** Record the issue↔branch relationship (BranchInfo.jiraKey). */
async function linkBranch(
  jiraKey: string,
  repo: string,
  branch: string
): Promise<void> {
  try {
    await prisma.branchInfo.upsert({
      where: { repo_branch: { repo, branch } },
      create: { repo, branch, jiraKey },
      update: { jiraKey },
    });
  } catch {
    /* relationship is best-effort; branch creation itself already succeeded */
  }
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

  const pending = await prisma.bulkOperationItem.findMany({
    where: { operationId, status: "pending" },
    orderBy: { jiraKey: "asc" },
  });

  const results: Record<string, ItemResult> = {};

  // Simple bounded pool: `concurrency` workers drain the pending list.
  const queue = [...pending];
  const runners = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        results[item.jiraKey] = await processWithRetry(operationId, item.id, item.jiraKey, auth, concurrency);
      }
    }
  );
  await Promise.all(runners);

  const succeeded = Object.values(results).filter((r) => r.status === "succeeded" || r.status === "skipped").length;
  const failed = Object.values(results).filter((r) => r.status === "failed").length;
  const state = failed === 0 ? "completed" : succeeded > 0 ? "partially_failed" : "failed";

  await prisma.bulkOperation.update({
    where: { id: op.id },
    data: {
      state,
      succeeded,
      failed,
      completedAt: new Date(),
    },
  });

  await notifyResult(op, state, succeeded, failed);
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
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
      attemptCount: { increment: 1 },
      after: (after ?? undefined) as Prisma.InputJsonValue,
    },
  });

  return { status: finalStatus, error: result.error };
}

async function notifyResult(
  op: { requestedBy: string; type: string; id: string },
  state: string,
  succeeded: number,
  failed: number
): Promise<void> {
  try {
    const { notifyUser } = await import("@/lib/notify");
    const title =
      state === "completed"
        ? `Bulk ${op.type} completed`
        : state === "partially_failed"
          ? `Bulk ${op.type} partially failed`
          : `Bulk ${op.type} failed`;
    await notifyUser(op.requestedBy, {
      type: "system",
      title,
      body: `${succeeded} succeeded, ${failed} failed.`,
      link: `/bulk?operation=${op.id}`,
    });
  } catch {
    /* ignore notification errors */
  }
}
