import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, bitbucketRepoList } from "@/lib/env";
import { jiraWith, jiraIssueFields, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import { bitbucket, type BbCreds } from "@/lib/bitbucket/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { extractEpicKey } from "@/lib/issues/epic";
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

import {
  type BulkAction,
  type BranchParams,
  type DependencyScope,
  type BulkSelector,
  type ActionParams,
  actionParams,
  DEFAULT_BRANCH_TEMPLATE,
  MAX_KEYS,
  MAX_FILTER_KEYS,
} from "./contracts";
import { normalizeKey } from "./validation";
import {
  type IssueRow,
  type TransitionErrorKind,
  type TransitionGetter,
  type PreviewItem,
  type PreviewResult,
  computePreview,
  determineSkipReason,
  isTransitionError,
} from "./preview";
import {
  createPreviewBulkOperation,
  findBulkOperationById,
  confirmBulkOperation,
  cancelBulkOperation,
  claimBulkOperation,
  findPendingBulkOperationItems,
  findBulkOperationItemById,
  markBulkOperationItemRunning,
  recordBulkOperationItemResult,
  finalizeBulkOperation,
  isTerminalOperationState,
} from "./repository";

export * from "./contracts";
export * from "./validation";
export * from "./selection";
export * from "./preview";
export * from "./repository";

export { extractEpicKey };

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
    let skipReason = determineSkipReason(preview.classification, {
      fieldSkipReason,
      fieldAvailable,
      transitionError,
    });
    let warning = fieldWarning ?? preview.warning;

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

  const op = await createPreviewBulkOperation({
    type: action.kind,
    requestedBy,
    payload: {
      action,
      params: actionParams(action),
      cycles,
      truncated,
      ...(options?.selector ? { selector: options.selector } : {}),
    } as Prisma.InputJsonValue,
    total: targets.length,
    items: items.map((item) => ({
      jiraKey: item.jiraKey,
      before: item.before,
      after: item.after,
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
      },
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
  return confirmBulkOperation(operationId, requestedBy);
}

/** Mark a preview as cancelled without executing it. */
export async function cancelBulk(operationId: string, requestedBy: string): Promise<void> {
  await cancelBulkOperation(operationId, requestedBy);
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

export function isTerminal(state: string): boolean {
  return isTerminalOperationState(state);
}

/**
 * M4-03 — Execute a confirmed operation. Processes pending items with a
 * bounded concurrency, retries transient failures in place, and updates the
 * cache after each item. Succeeded items are never re-run (idempotency across
 * retries).
 */
export async function executeBulkOperation(operationId: string): Promise<void> {
  const claimResult = await claimBulkOperation(operationId);
  if (!claimResult.claimed || !claimResult.operation) return;
  const op = claimResult.operation;

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
  const pending = await findPendingBulkOperationItems(operationId);

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
  const summary = await finalizeBulkOperation(operationId);
  if (summary?.terminal) {
    await notifyResult(op, summary.state, summary.succeeded, summary.failed, summary.skipped);
  }
}

const MAX_ATTEMPTS = 3;

async function processWithRetry(
  operationId: string,
  itemId: string,
  key: string,
  auth: OpAuth,
  _concurrency: number
): Promise<ItemResult> {
  const opRow = await findBulkOperationById(operationId);
  if (!opRow) return { status: "skipped" };

  // Idempotency guard: never re-run an item that already succeeded.
  const current = await findBulkOperationItemById(itemId);
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

  await markBulkOperationItemRunning(itemId);

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

  await recordBulkOperationItemResult(itemId, {
    status: finalStatus,
    error: result.error,
    retryable: result.retryable,
    attempts,
    after: after as Record<string, unknown> | null,
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
