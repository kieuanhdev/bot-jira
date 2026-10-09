import { prisma } from "@/lib/prisma";
import { env, bitbucketRepoList } from "@/lib/env";
import { jiraWith, jiraIssueFields, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import { bitbucket, type BbCreds } from "@/lib/bitbucket/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import type { JiraIssue } from "@/lib/jira/types";
import { renderBranchName } from "./branch-name";
import { recordExplicitBranchLink } from "@/lib/bitbucket/link-service";
import { audit } from "@/lib/audit";
import { formatJiraStartedAt } from "@/lib/worklogs/schema";
import {
  type BulkAction,
  type BranchParams,
  type ActionParams,
  DEFAULT_BRANCH_TEMPLATE,
} from "./contracts";

/**
 * Bulk Action Executors.
 *
 * Dedicated executors for:
 *   - Field updates (update-fields, set-epic, assign, add/remove-labels, set-points,
 *     set-estimate, set-due-date, set-priority, add/remove-fix-version)
 *   - Status transitions
 *   - Comments
 *   - Worklogs
 *   - Branches (including issue-branch linking and Jira comments)
 *
 * All operations run through typed execution context and preserve Jira refresh
 * and audit ordering.
 */

export type JiraClientInstance = ReturnType<typeof jiraWith>;

export type OpAuth = {
  jira: JiraAuth | null;
  bitbucket: BbCreds | null;
};

export type OpRow = {
  id: string;
  type: string;
  requestedBy: string;
  payload: { action: BulkAction; params?: ActionParams };
  state?: string;
  startedAt?: Date | null;
};

export type Ctx = {
  op: OpRow;
  auth: OpAuth;
  concurrency?: number;
};

export interface BulkExecutionContext {
  jira: JiraClientInstance;
  bitbucket?: BbCreds | null;
  operationId?: string;
  requestedBy?: string;
}

export type BulkItemResult = {
  status: "succeeded" | "failed" | "skipped";
  error?: string;
  retryable?: boolean;
};

export type ItemResult = BulkItemResult;

export type FieldUpdateAction =
  | Extract<BulkAction, { kind: "update-fields" }>
  | Extract<BulkAction, { kind: "set-epic" }>
  | Extract<BulkAction, { kind: "assign" }>
  | Extract<BulkAction, { kind: "add-labels" }>
  | Extract<BulkAction, { kind: "remove-labels" }>
  | Extract<BulkAction, { kind: "set-points" }>
  | Extract<BulkAction, { kind: "set-estimate" }>
  | Extract<BulkAction, { kind: "set-due-date" }>
  | Extract<BulkAction, { kind: "set-priority" }>
  | Extract<BulkAction, { kind: "add-fix-version" }>
  | Extract<BulkAction, { kind: "remove-fix-version" }>;

export type TransitionAction = Extract<BulkAction, { kind: "transition" }>;
export type CommentAction = Extract<BulkAction, { kind: "add-comment" }>;
export type WorklogAction = Extract<BulkAction, { kind: "log-work" }>;
export type BranchAction = Extract<BulkAction, { kind: "create-branches" }>;

export function isFieldUpdateAction(action: BulkAction): action is FieldUpdateAction {
  switch (action.kind) {
    case "update-fields":
    case "set-epic":
    case "assign":
    case "add-labels":
    case "remove-labels":
    case "set-points":
    case "set-estimate":
    case "set-due-date":
    case "set-priority":
    case "add-fix-version":
    case "remove-fix-version":
      return true;
    default:
      return false;
  }
}

export async function getIssue(client: JiraClientInstance, key: string): Promise<JiraIssue> {
  return client.getIssue(key, jiraIssueFields());
}

/** Record the issue↔branch relationship (BranchInfo.jiraKey) explicitly. */
async function linkBranch(
  jiraKey: string,
  repo: string,
  branch: string
): Promise<void> {
  await recordExplicitBranchLink(repo, branch, jiraKey);
}

export async function createBranchForIssue(
  jira: JiraClientInstance,
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
      await notifyWatchersOfComment(
        key,
        created.author?.name ?? created.author?.displayName ?? "User",
        comment,
        created.id
      ).catch(() => null);
    }
  }

  return { branch: branchName, repo };
}

export async function executeFieldUpdateAction(
  ctx: BulkExecutionContext,
  key: string,
  action: FieldUpdateAction
): Promise<{ error?: string; retryable?: boolean } | void> {
  const jira = ctx.jira;

  switch (action.kind) {
    case "update-fields": {
      const issue = await getIssue(jira, key);
      const patch: {
        assignee?: string | null;
        labels?: string[];
        priority?: string;
        issueType?: string;
        points?: number | null;
        fixVersions?: string[];
        dueDate?: string | null;
        originalEstimate?: string;
        epic?: string | null;
      } = {};
      if (action.value.assignee !== undefined) patch.assignee = action.value.assignee;
      if (action.value.labels !== undefined) patch.labels = action.value.labels;
      if (action.value.priority !== undefined) patch.priority = action.value.priority;
      if (action.value.issueType !== undefined) patch.issueType = action.value.issueType;
      if (action.value.points !== undefined) patch.points = action.value.points;
      if (action.value.dueDate !== undefined) patch.dueDate = action.value.dueDate;
      if (action.value.estimate !== undefined) patch.originalEstimate = action.value.estimate;
      if (action.value.epic !== undefined) patch.epic = action.value.epic;
      if (action.value.fixVersions !== undefined) {
        const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
        if (action.value.fixVersions.length === 0) {
          patch.fixVersions = [];
        } else {
          const ids = await Promise.all(
            action.value.fixVersions.map((name) => jira.resolveVersionId(projectKey, name))
          );
          if (ids.some((id) => id == null)) {
            return {
              error: "One or more Fix Versions do not exist in this project",
              retryable: false,
            };
          }
          patch.fixVersions = ids.filter((id): id is string => id != null);
        }
      }
      await jira.updateIssue(key, patch);
      break;
    }
    case "set-epic": {
      await jira.updateIssue(key, { epic: action.value });
      break;
    }
    case "assign": {
      await jira.updateIssue(key, { assignee: action.value });
      break;
    }
    case "add-labels": {
      const issue = await getIssue(jira, key);
      const merged = Array.from(new Set([...(issue.fields.labels ?? []), ...(action.value ?? [])]));
      await jira.updateIssue(key, { labels: merged });
      break;
    }
    case "remove-labels": {
      const issue = await getIssue(jira, key);
      const drop = new Set(action.value ?? []);
      const kept = (issue.fields.labels ?? []).filter((l) => !drop.has(l));
      await jira.updateIssue(key, { labels: kept });
      break;
    }
    case "set-points": {
      await jira.updateIssue(key, { points: action.value });
      break;
    }
    case "set-estimate": {
      const meta = await jira.getEditMeta(key);
      if (!meta.fields?.timetracking) {
        return {
          error: "Time Tracking is not editable for this Jira issue. Add it to the issue edit screen.",
          retryable: false,
        };
      }
      await jira.updateIssue(key, { originalEstimate: action.value });
      break;
    }
    case "set-due-date": {
      const meta = await jira.getEditMeta(key);
      if (!meta.fields?.duedate) {
        return {
          error: "Due Date is not editable for this Jira issue",
          retryable: false,
        };
      }
      await jira.updateIssue(key, { dueDate: action.value });
      break;
    }
    case "set-priority": {
      await jira.updateIssue(key, { priority: action.value });
      break;
    }
    case "add-fix-version": {
      const issue = await getIssue(jira, key);
      const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
      const id = await jira.resolveVersionId(projectKey, action.value);
      if (!id) {
        return {
          error: `Version "${action.value}" not found`,
          retryable: false,
        };
      }
      const current = (issue.fields.fixVersions ?? []).map((v) => v.id ?? "").filter(Boolean);
      if (!current.includes(id)) {
        await jira.updateIssue(key, { fixVersions: [...current, id] });
      }

      // Provenance tracking & audit (DEP-07, DEP-12)
      if (ctx.operationId) {
        const itemRow = await prisma.bulkOperationItem.findUnique({
          where: { operationId_jiraKey: { operationId: ctx.operationId, jiraKey: key } },
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
              operationId: ctx.operationId,
              active: true,
              appliedAt: new Date(),
            },
            update: {
              active: true,
              operationId: ctx.operationId,
              appliedAt: new Date(),
              removedAt: null,
            },
          });

          await audit({
            actorId: ctx.requestedBy ?? "system",
            action: "issue.fix_version.propagate",
            target: key,
            before: { fixVersions: current },
            after: { fixVersions: [...current, id], rootKey, versionId: id },
            source: "worker",
            correlationId: ctx.operationId,
          });
        }
      }
      break;
    }
    case "remove-fix-version": {
      const issue = await getIssue(jira, key);
      const projectKey = issue.fields.project?.key ?? key.split("-")[0] ?? "";
      const id = await jira.resolveVersionId(projectKey, action.value);
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
            actorId: ctx.requestedBy ?? "system",
            action: "issue.fix_version.propagate_remove",
            target: key,
            before: { fixVersions: current },
            after: { fixVersions: kept, versionId: id },
            source: "worker",
            correlationId: ctx.operationId ?? null,
          });
        }
      }
      break;
    }
  }
}

export async function executeTransitionAction(
  ctx: BulkExecutionContext,
  key: string,
  action: TransitionAction
): Promise<{ error?: string; retryable?: boolean } | void> {
  const t = await ctx.jira.findTransition(key, action.value);
  if (!t) {
    return { error: `No transition to "${action.value}"`, retryable: false };
  }
  await ctx.jira.transition(key, t.id);
}

export async function executeCommentAction(
  ctx: BulkExecutionContext,
  key: string,
  action: CommentAction
): Promise<{ error?: string; retryable?: boolean } | void> {
  const comment = await ctx.jira.addComment(key, action.value);
  await notifyWatchersOfComment(
    key,
    comment.author?.name ?? comment.author?.displayName ?? "User",
    action.value,
    comment.id
  ).catch(() => null);
}

export async function executeWorklogAction(
  ctx: BulkExecutionContext,
  key: string,
  action: WorklogAction
): Promise<{ error?: string; retryable?: boolean } | void> {
  const started = action.value.started
    ? formatJiraStartedAt(action.value.started)
    : undefined;
  await ctx.jira.addWorklog(
    key,
    { timeSpent: action.value.timeSpent, started, comment: action.value.comment },
    "leave"
  );
}

export async function executeBranchAction(
  ctx: BulkExecutionContext,
  key: string,
  action: BranchAction
): Promise<{ error?: string; retryable?: boolean } | void> {
  if (!ctx.bitbucket) {
    return { error: "Bitbucket credentials required", retryable: false };
  }
  const result = await createBranchForIssue(ctx.jira, key, action.value, ctx.bitbucket);
  if (result.error) {
    return { error: result.error, retryable: result.retryable ?? true };
  }
}

/**
 * Execute a single bulk action against an issue key using typed context.
 * Guarantees Jira cache refresh after successful mutations, and audits
 * provenance updates for fix versions prior to cache refresh.
 */
export async function executeBulkAction(
  ctx: BulkExecutionContext,
  key: string,
  action: BulkAction
): Promise<BulkItemResult> {
  if (!ctx.jira) {
    return { status: "failed", error: "Jira credentials required", retryable: false };
  }

  try {
    let res: { error?: string; retryable?: boolean } | void;
    if (isFieldUpdateAction(action)) {
      res = await executeFieldUpdateAction(ctx, key, action);
    } else if (action.kind === "transition") {
      res = await executeTransitionAction(ctx, key, action);
    } else if (action.kind === "add-comment") {
      res = await executeCommentAction(ctx, key, action);
    } else if (action.kind === "log-work") {
      res = await executeWorklogAction(ctx, key, action);
    } else if (action.kind === "create-branches") {
      res = await executeBranchAction(ctx, key, action);
    } else {
      return { status: "failed", error: "unknown action", retryable: false };
    }

    if (res && res.error) {
      return { status: "failed", error: res.error, retryable: res.retryable ?? false };
    }

    // Update the local cache after a successful mutation so the board reflects
    // the change immediately. Best-effort: a refresh failure is not fatal.
    await refreshJiraIssueCache(ctx.jira, key);

    return { status: "succeeded" };
  } catch (e) {
    if (action.kind === "log-work") {
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

/**
 * Adapts legacy execution Ctx to BulkExecutionContext and delegates to executeBulkAction.
 */
export async function applyItem(ctx: Ctx, key: string): Promise<ItemResult> {
  const action = ctx.op.payload as { action: BulkAction };
  const { action: a } = action;
  if (!ctx.auth.jira) {
    return { status: "failed", error: "Jira credentials required", retryable: false };
  }
  const jira = jiraWith(ctx.auth.jira);
  const execCtx: BulkExecutionContext = {
    jira,
    bitbucket: ctx.auth.bitbucket,
    operationId: ctx.op.id,
    requestedBy: ctx.op.requestedBy,
  };
  return executeBulkAction(execCtx, key, a);
}
