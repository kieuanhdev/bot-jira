import { randomUUID } from "node:crypto";
import { guard } from "../guard";
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
import { jiraClientForProject, jiraSyncDependencies } from "./jira-sync/context";
import { runJiraSyncPipeline } from "./jira-sync/runner";
import { safeError } from "./jira-sync/types";
import type {
  JiraSyncSource,
  PollJiraJobData,
  PollJiraProjectJobData,
  ProjectStats,
} from "./jira-sync/types";

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

export { safeError };
export type { JiraSyncSource, PollJiraJobData, PollJiraProjectJobData, ProjectStats };

export async function syncProject(
  projectKey: string,
  full: boolean,
  options?: { signal?: AbortSignal; runToken?: string }
): Promise<ProjectStats> {
  const runToken = options?.runToken ?? randomUUID();
  const jira = await jiraClientForProject(projectKey);
  return runJiraSyncPipeline(
    {
      projectKey,
      full,
      runToken,
      leaseTtlSeconds: computeLeaseTtlSeconds(full),
      jira,
      signal: options?.signal,
    },
    jiraSyncDependencies
  );
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


    try {
      const { updateProjectBootstrapState } = await import("@/lib/jira/project-catalog");
      await updateProjectBootstrapState(
        projectKey,
        ok ? "ready" : "partial",
        stats.errors.length > 0 ? stats.errors.join("; ") : null
      );
    } catch {
      // Non-critical catalog update
    }

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

    if (!isAlreadyRunning) {
      try {
        const { updateProjectBootstrapState } = await import("@/lib/jira/project-catalog");
        await updateProjectBootstrapState(projectKey, "failed", errorMsg);
      } catch {
        // Non-critical
      }
    }

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

  const { listSyncEnabledProjectKeys } = await import("@/lib/jira/project-catalog");
  const projects = await listSyncEnabledProjectKeys();
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
