import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { jira, parseJiraDate } from "@/lib/jira/client";
import { buildProjectPollJql } from "@/lib/jira/jql";
import { upsertJiraCommentsWithNew, upsertJiraIssue } from "@/lib/issues/cache";
import {
  notifyWatchersOfComment,
  notifyWatchersOfIssueChange,
} from "@/lib/issues/notify-watchers";
import { jiraProjectList } from "@/lib/env";
import { guard, env } from "../guard";
import type { WorkerLog } from "../guard";
import {
  claimJiraSyncLease,
  assertJiraSyncLease,
  renewJiraSyncLease,
  releaseJiraSyncLease,
  computeLeaseTtlSeconds,
  SyncAlreadyRunningError,
  SyncLeaseLostError,
  JiraSyncAbortedError,
} from "../jira-sync-lease";

export {
  claimJiraSyncLease,
  assertJiraSyncLease,
  renewJiraSyncLease,
  releaseJiraSyncLease,
  computeLeaseTtlSeconds,
  SyncAlreadyRunningError,
  SyncLeaseLostError,
  JiraSyncAbortedError,
};

const MAX_PAGES = 150;
const PAGE_SIZE = 50;

export type JiraSyncSource = "schedule" | "manual" | "startup" | "admin" | "recovery";

export type PollJiraProjectJobData = {
  projectKey: string;
  full: boolean;
  source: JiraSyncSource;
  requestedBy?: string;
  requestedAt: string;
};

export type PollJiraJobData = {
  projectKey?: string;
  full?: boolean;
  requestedBy?: string;
  source?: JiraSyncSource;
  requestedAt?: string;
};

export type ProjectStats = {
  projectKey: string;
  created: number;
  updated: number;
  comments: number;
  deleted: number;
  pages: number;
  cursor: string | null;
  errors: string[];
  cursorAdvanced?: boolean;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  workflowStatusCount?: number;
  workflowRefreshError?: string | null;
};

export function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

export async function syncProject(
  projectKey: string,
  full: boolean,
  options?: { signal?: AbortSignal; runToken?: string }
): Promise<ProjectStats> {
  const runToken = options?.runToken ?? randomUUID();
  const isFullScan_precomputed = full; // may adjust after cursor check
  const leaseTtlSeconds = computeLeaseTtlSeconds(isFullScan_precomputed);
  const expiresAt = new Date(Date.now() + leaseTtlSeconds * 1000);

  /**
   * Renew the lease and check abort signal in one call.
   * Called before each Jira API request, after each response
   * before cache writes, and before finalize.
   */
  async function renewAndAssert(): Promise<void> {
    if (options?.signal?.aborted) {
      throw new JiraSyncAbortedError(`Jira sync aborted for ${projectKey}`);
    }
    const newExpiry = new Date(Date.now() + leaseTtlSeconds * 1000);
    await renewJiraSyncLease(projectKey, runToken, newExpiry);
  }

  // Giai đoạn 1: Atomically claim project lease before any operation
  const current = await claimJiraSyncLease(projectKey, runToken, expiresAt);

  const parsedCursor = current.cursor ? new Date(current.cursor) : null;
  const validCursor = parsedCursor && !Number.isNaN(parsedCursor.getTime()) ? parsedCursor : null;
  const since = !full && validCursor
    ? new Date(validCursor.getTime() - env.jiraSyncOverlapSeconds * 1000)
    : undefined;
  const jql = buildProjectPollJql(projectKey, since);
  const stats: ProjectStats = {
    projectKey,
    created: 0,
    updated: 0,
    comments: 0,
    deleted: 0,
    pages: 0,
    cursor: current.cursor,
    errors: [],
    cursorAdvanced: false,
  };
  let newestUpdatedAt = validCursor;
  let exhaustedAllPages = false;
  const seenKeys = new Set<string>();
  const isFullScan = full || !validCursor;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      // Renew lease + check abort before each page fetch
      await renewAndAssert();

      const result = await jira.search(
        jql,
        PAGE_SIZE,
        page * PAGE_SIZE,
        ...(options?.signal ? [options.signal] : [])
      );
      stats.pages++;

      // Renew lease after Jira response, before writing cache
      await renewAndAssert();

      for (const issue of result.issues) {

        seenKeys.add(issue.key);
        try {
          const previous = await prisma.issueCache.findUnique({
            where: { jiraKey: issue.key },
          });

          // Giai đoạn 2: Conditional upsert + link sync inside transaction.
          // Notifications are deferred until after commit succeeds.
          const { applied, data: currentIssue } = await upsertJiraIssue(issue);
          if (applied) {
            if (previous) stats.updated++;
            else stats.created++;

            // Notification fires AFTER transaction commit.
            // Notification failure must not affect sync correctness.
            await notifyWatchersOfIssueChange(previous, {
              jiraKey: issue.key,
              ...currentIssue,
            }).catch(() => null);
          }

          const issueUpdatedAt = parseJiraDate(issue.fields.updated);
          if (issueUpdatedAt && (!newestUpdatedAt || issueUpdatedAt > newestUpdatedAt)) {
            newestUpdatedAt = issueUpdatedAt;
          }

          try {
            const commentData = issue.fields.comment as { total?: number; comments?: import("@/lib/jira/types").JiraComment[] } | undefined;
            const availableComments = commentData?.comments ?? [];
            const totalComments = commentData?.total ?? availableComments.length;

            let commentsToSync: import("@/lib/jira/types").JiraComment[] = [];
            if (availableComments.length > 0 && totalComments <= availableComments.length) {
              commentsToSync = availableComments;
            } else if (totalComments > 0) {
              commentsToSync = await jira.getComments(
                issue.key,
                ...(options?.signal ? [options.signal] : [])
              );
            }

            if (commentsToSync.length > 0) {
              const { synced, newComments } = await upsertJiraCommentsWithNew(
                issue.key,
                commentsToSync
              );
              stats.comments += synced;
              // Notify only after comment cache write succeeds
              for (const nc of newComments) {
                await notifyWatchersOfComment(nc.jiraKey, nc.author, nc.body, nc.id).catch(() => null);
              }
            }
          } catch (error) {
            // Comment/link sync errors are tracked and prevent cursor advancement.
            stats.errors.push(`${issue.key} comments: ${safeError(error)}`);
          }
        } catch (error) {
          if (error instanceof SyncLeaseLostError || error instanceof JiraSyncAbortedError) {
            throw error;
          }
          stats.errors.push(`${issue.key}: ${safeError(error)}`);
        }
      }

      if (result.issues.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= result.total) {
        exhaustedAllPages = true;
        break;
      }
    }

    if (options?.signal?.aborted) {
      throw new JiraSyncAbortedError(`Jira sync aborted for ${projectKey}`);
    }

    if (!exhaustedAllPages) {
      throw new Error(`Jira sync exceeded ${MAX_PAGES * PAGE_SIZE} issues for ${projectKey}; cursor was not advanced`);
    }

    // Ensure newestUpdatedAt does not regress before validCursor
    if (validCursor && newestUpdatedAt && newestUpdatedAt < validCursor) {
      newestUpdatedAt = validCursor;
    }

    // Advance cursor only if no item errors occurred and all pages were read and not aborted
    const hasErrors = stats.errors.length > 0;
    const cursor = !hasErrors && !options?.signal?.aborted
      ? (newestUpdatedAt?.toISOString() ?? current.cursor)
      : current.cursor;
    const cursorAdvanced = !hasErrors && !options?.signal?.aborted && Boolean(cursor && cursor !== current.cursor);
    stats.cursor = cursor;
    stats.cursorAdvanced = cursorAdvanced;

    // Refresh project workflow statuses from Jira before finalize cursor
    try {
      await renewAndAssert();
      const statusesResp = await jira.getProjectStatuses(projectKey);
      const flatStatuses: Array<{ id: string; name: string; category?: string }> = [];
      const seenIds = new Set<string>();
      for (const item of statusesResp || []) {
        for (const st of item.statuses || []) {
          if (st.id && !seenIds.has(st.id)) {
            seenIds.add(st.id);
            flatStatuses.push({
              id: st.id,
              name: st.name,
              category: st.statusCategory?.key,
            });
          }
        }
      }
      if (flatStatuses.length > 0) {
        const { upsertProjectWorkflowSnapshot } = await import("@/lib/jira/project-workflow-store");
        const res = await upsertProjectWorkflowSnapshot(projectKey, flatStatuses);
        stats.workflowStatusCount = res.statusCount;
      }
    } catch (err: unknown) {
      const errText = safeError(err);
      stats.workflowRefreshError = errText;
      console.warn(`[poll-jira] Failed to refresh workflow statuses for ${projectKey}:`, errText);
    }

    // Renew lease before finalize
    await renewAndAssert();

    // Giai đoạn 3: Finalize cursor and soft-delete inside short atomic transaction under active lease
    await prisma.$transaction(async (tx) => {
      const currentCursor = await tx.integrationCursor.findUnique({
        where: { id: current.id },
      });

      if (!currentCursor || currentCursor.activeRunToken !== runToken) {
        throw new SyncLeaseLostError(
          `Jira sync lease lost for ${projectKey}: active token changed`
        );
      }

      // Soft-delete unseen issues only on successful full scan with 0 errors
      if (isFullScan && !hasErrors && exhaustedAllPages && !options?.signal?.aborted) {
        const deleted = await tx.issueCache.updateMany({
          where: {
            projectKey,
            deletedAt: null,
            ...(seenKeys.size > 0 ? { jiraKey: { notIn: [...seenKeys] } } : {}),
          },
          data: { deletedAt: new Date() },
        });
        stats.deleted = deleted.count;
      }

      const lastSuccessAt = !hasErrors ? new Date() : currentCursor.lastSuccessAt;
      const lastErrorText = hasErrors ? stats.errors.slice(0, 10).join("; ").slice(0, 2000) : null;
      stats.lastSuccessAt = lastSuccessAt ? (lastSuccessAt instanceof Date ? lastSuccessAt.toISOString() : new Date(lastSuccessAt).toISOString()) : null;
      stats.lastError = lastErrorText;

      const updateRes = await tx.integrationCursor.updateMany({
        where: {
          id: current.id,
          activeRunToken: runToken,
        },
        data: {
          cursor,
          lastSuccessAt,
          lastErrorAt: hasErrors ? new Date() : null,
          lastError: lastErrorText,
          stats: {
            ...stats,
            cursorAdvanced,
          },
          activeRunToken: null,
          activeRunStartedAt: null,
          activeRunExpiresAt: null,
        },
      });

      if (updateRes.count === 0) {
        throw new SyncLeaseLostError(
          `Jira sync lease lost for ${projectKey} during finalize commit`
        );
      }
    });

    return stats;
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError || error instanceof SyncLeaseLostError) {
      throw error;
    }
    const message = safeError(error);
    stats.lastError = message;

    // Only record error if activeRunToken is still owned by this run
    await prisma.integrationCursor.updateMany({
      where: {
        id: current?.id,
        activeRunToken: runToken,
      },
      data: {
        lastErrorAt: new Date(),
        lastError: message,
        stats,
      },
    }).catch(() => null);

    throw error;
  } finally {
    // Only release our own lease
    await releaseJiraSyncLease(projectKey, runToken).catch(() => null);
  }
}

export async function runPollJiraProject(
  data: PollJiraProjectJobData,
  options?: { signal?: AbortSignal }
): Promise<WorkerLog> {
  const { getSystemJiraAuth } = await import("@/lib/jira/client");
  const auth = await getSystemJiraAuth();
  if (!auth) return guard(false, "Jira not configured in env or user settings");

  const projectKey = data.projectKey?.trim().toUpperCase();
  if (!projectKey) {
    return { ok: false, errors: ["Missing or invalid projectKey"] };
  }

  const requestedAtMs = data.requestedAt ? new Date(data.requestedAt).getTime() : Date.now();
  const queueLagMs = Math.max(0, Date.now() - (Number.isNaN(requestedAtMs) ? Date.now() : requestedAtMs));
  const startedAt = Date.now();

  try {
    const stats = await syncProject(projectKey, Boolean(data.full), { signal: options?.signal });
    const durationMs = Date.now() - startedAt;
    const ok = stats.errors.length === 0;

    console.info(
      JSON.stringify({
        level: ok ? "info" : "warn",
        job: "poll-jira-project",
        project: projectKey,
        projectKey,
        source: data.source,
        requestedBy: data.requestedBy ?? null,
        queueLagMs,
        durationMs,
        lastSuccessAt: stats.lastSuccessAt ?? null,
        lastError: stats.lastError ?? null,
        pages: stats.pages,
        created: stats.created,
        updated: stats.updated,
        comments: stats.comments,
        deleted: stats.deleted,
        issueErrors: stats.errors.length,
        cursorAdvanced: Boolean(stats.cursorAdvanced),
        ok,
      })
    );


    return {
      ok,
      stats: {
        ...stats,
        queueLagMs,
        durationMs,
        source: data.source,
        requestedBy: data.requestedBy ?? null,
        ok,
      },
      ...(stats.errors.length > 0 ? { errors: stats.errors } : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = safeError(error);
    const isAlreadyRunning = error instanceof SyncAlreadyRunningError;
    const isLeaseLost = error instanceof SyncLeaseLostError;

    console[isAlreadyRunning ? "info" : isLeaseLost ? "warn" : "error"](
      JSON.stringify({
        level: isAlreadyRunning ? "info" : isLeaseLost ? "warn" : "error",
        job: "poll-jira-project",
        project: projectKey,
        projectKey,
        source: data.source,
        queueLagMs,
        durationMs,
        lastError: errorMsg,
        error: errorMsg,
      })
    );

    // Lease contention is an expected coalescing outcome: another worker/run
    // already owns this project's sync. Treat it as skipped so recordRun does
    // not turn it into a job failure, retry it, or raise a false health alert.
    // The active owner will either finish normally or its bounded lease will
    // expire, after which the scheduler/watchdog can claim a fresh lease.
    if (isAlreadyRunning) {
      return {
        ok: true,
        skipped: true,
        reason: errorMsg,
        stats: {
          projectKey,
          durationMs,
          queueLagMs,
          source: data.source,
          coalescedByLease: true,
          ok: true,
        },
      };
    }

    return {
      ok: false,
      errors: [errorMsg],
      stats: {
        projectKey,
        durationMs,
        queueLagMs,
        lastError: errorMsg,
        source: data.source,
        ok: false,
      },
    };
  }
}

/** Legacy all-project / single-project backward compatibility entrypoint. */
export async function runPollJira(data: PollJiraJobData = {}): Promise<WorkerLog> {
  if (data.projectKey) {
    return runPollJiraProject({
      projectKey: data.projectKey,
      full: Boolean(data.full),
      source: data.source ?? (data.requestedBy ? "manual" : "schedule"),
      requestedBy: data.requestedBy,
      requestedAt: data.requestedAt ?? new Date().toISOString(),
    });
  }

  const { getSystemJiraAuth } = await import("@/lib/jira/client");
  const auth = await getSystemJiraAuth();
  if (!auth) return guard(false, "Jira not configured in env or user settings");

  const projects = jiraProjectList;
  if (projects.length === 0) {
    return { ok: false, errors: ["No Jira projects configured"] };
  }

  const results: ProjectStats[] = [];
  const errors: string[] = [];
  for (const key of projects) {
    try {
      results.push(await syncProject(key, Boolean(data.full)));
    } catch (error) {
      errors.push(`${key}: ${safeError(error)}`);
    }
  }

  const stats = results.reduce(
    (total, item) => ({
      projects: total.projects + 1,
      created: total.created + item.created,
      updated: total.updated + item.updated,
      comments: total.comments + item.comments,
      deleted: total.deleted + item.deleted,
      issueErrors: total.issueErrors + item.errors.length,
    }),
    { projects: 0, created: 0, updated: 0, comments: 0, deleted: 0, issueErrors: 0 }
  );
  const allErrors = [...errors, ...results.flatMap((r) => r.errors)];
  const totalProjects = projects.length;
  const failedProjects = errors.length;
  const allFailed = failedProjects >= totalProjects;

  if (allFailed) {
    return { ok: false, stats: { ...stats, failedProjects, totalProjects }, errors: allErrors };
  }

  return {
    ok: true,
    stats: { ...stats, failedProjects, totalProjects },
    ...(allErrors.length > 0 ? { errors: allErrors } : {}),
  };
}
