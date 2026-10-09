import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { listSyncEnabledProjectKeys } from "@/lib/jira/project-catalog";
import { getWorkerHealth } from "@/lib/health/worker-health";
import type { JiraSyncSource, PollJiraJobData } from "./workers/poll-jira";
import { runPollJiraDispatch, type PollJiraDispatchJobData } from "./workers/poll-jira-dispatch";
import type { ProcessWebhookJobData } from "./workers/process-webhook";
import type { RefreshBoardMembershipJobData } from "./workers/refresh-board-membership";
import type { WorkerLog } from "./guard";
import {
  startBoss,
  stopBoss as stopBossConnection,
} from "./connection";
import { registerQueues, registerWorkers, stopRegistryTimers } from "./registry";
import { registerSchedules } from "./schedules";

export { getBoss, startBoss } from "./connection";
export { JOB_NAMES, type JobName } from "./job-names";

export async function recordRun(name: string, run: () => Promise<WorkerLog>): Promise<WorkerLog> {
  const startedAt = Date.now();
  if (name !== "poll-watched-issues") {
    console.info(JSON.stringify({ level: "info", job: name, message: `job ${name} started` }));
  }
  const cursor = await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: "worker", scope: name } },
    create: { integration: "worker", scope: name, lastStartedAt: new Date() },
    update: { lastStartedAt: new Date(), lastError: null },
  });
  try {
    const result = await run();
    const durationMs = Date.now() - startedAt;
    const errorText = result.ok ? null : (result.errors ?? [result.reason ?? "Worker failed"]).join("; ").slice(0, 2000);
    await prisma.integrationCursor.update({
      where: { id: cursor.id },
      data: {
        lastSuccessAt: (result.ok && !result.skipped) ? new Date() : cursor.lastSuccessAt,
        lastErrorAt: result.ok ? null : new Date(),
        lastError: errorText,
        stats: { ...(result.stats ?? {}), skipped: Boolean(result.skipped), reason: result.reason ?? null },
      },
    });
    if (!result.ok) {
      console.warn(
        JSON.stringify({
          level: "warn",
          job: name,
          durationMs,
          message: `job ${name} finished with warning/error`,
          error: errorText,
          stats: result.stats,
        })
      );
      throw new Error(errorText ?? `${name} failed`);
    }
    if (name !== "poll-watched-issues") {
      console.info(
        JSON.stringify({
          level: "info",
          job: name,
          durationMs,
          message: `job ${name} completed`,
          stats: result.stats,
        })
      );
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    console.error(
      JSON.stringify({
        level: "error",
        job: name,
        durationMs,
        message: `job ${name} failed`,
        error: message,
      })
    );
    await prisma.integrationCursor.update({
      where: { id: cursor.id },
      data: { lastErrorAt: new Date(), lastError: message },
    }).catch(() => null);
    throw error;
  }
}

export async function enqueueJiraProjectSync(data: {
  projectKey: string;
  full?: boolean;
  source?: JiraSyncSource;
  requestedBy?: string;
  requestedAt?: string;
}): Promise<string | null> {
  const boss = await startBoss();
  const normalizedKey = data.projectKey.trim().toUpperCase();
  const source = data.source ?? (data.requestedBy ? "manual" : "schedule");
  const priority = source === "manual" || source === "admin" ? 10 : source === "recovery" ? 5 : source === "startup" ? 2 : 1;
  const requestedAt = data.requestedAt ?? new Date().toISOString();

  return boss.send(
    "poll-jira-project",
    {
      projectKey: normalizedKey,
      full: Boolean(data.full),
      source,
      requestedBy: data.requestedBy,
      requestedAt,
    },
    {
      singletonKey: normalizedKey,
      singletonSeconds: source === "recovery" ? 240 : 55,
      priority,
      retryLimit: 4,
      retryDelay: 10,
      retryBackoff: true,
      // Incremental sync expires after configured timeout (default 15m).
      // pg-boss worker heartbeat detects dead workers before expiration.
      expireInSeconds: data.full ? Math.max(env.jiraSyncExpireSeconds, 900) : env.jiraSyncExpireSeconds,
      heartbeatSeconds: env.jiraHeartbeatSeconds,
    }
  );
}

export async function enqueueJiraDispatch(data: PollJiraDispatchJobData = {}): Promise<string | null> {
  const boss = await startBoss();
  const source = data.source ?? "schedule";
  const priority = source === "admin" ? 5 : source === "startup" ? 2 : 1;
  return boss.send("poll-jira-dispatch", data, {
    singletonKey: "jira-dispatch",
    singletonSeconds: 50,
    priority,
    retryLimit: 2,
    retryDelay: 5,
    expireInSeconds: 60,
  });
}

export async function enqueueJiraSync(data: PollJiraJobData): Promise<string | null> {
  if (data.projectKey) {
    return enqueueJiraProjectSync({
      projectKey: data.projectKey,
      full: data.full,
      source: data.source ?? (data.requestedBy ? "manual" : "schedule"),
      requestedBy: data.requestedBy,
      requestedAt: data.requestedAt,
    });
  }
  return enqueueJiraDispatch({
    full: data.full,
    source: (data.source as "schedule" | "startup" | "admin" | undefined) ?? (data.requestedBy ? "admin" : "schedule"),
    requestedBy: data.requestedBy,
  });
}

/** Enqueue an inbound webhook event for background processing (M5-01). */
export async function enqueueWebhookEvent(data: ProcessWebhookJobData): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("process-webhook", data, {
    // One in-flight job per event; redeliveries are deduped by the event row.
    singletonKey: `process-webhook:${data.eventId}`,
    singletonSeconds: 60,
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
  });
}

/** Enqueue a confirmed bulk operation for background execution. */
export async function enqueueBulkOperation(operationId: string): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("bulk-op", { operationId }, {
    // One in-flight job per operation so a re-queued op doesn't double-run.
    singletonKey: `bulk-op:${operationId}`,
    singletonSeconds: 3600,
    retryLimit: 1,
    retryDelay: 60,
  });
}

/** Enqueue check-branches manual sync. */
export async function enqueueCheckBranches(): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("check-branches", {}, {
    singletonKey: "check-branches:manual",
    singletonSeconds: 30,
    retryLimit: 1,
    retryDelay: 15,
  });
}

/** Enqueue poll-pr-comments manual sync. */
export async function enqueuePollPrComments(): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("poll-pr-comments", {}, {
    singletonKey: "poll-pr-comments:manual",
    singletonSeconds: 30,
    retryLimit: 1,
    retryDelay: 15,
  });
}

/** Wake the outbox consumer immediately after a push/Discord row is created. */
export async function enqueueNotificationDelivery(startAfter?: Date): Promise<string | null> {
  const boss = await startBoss();
  return boss.send("deliver-notifications", {}, {
    ...(startAfter ? { startAfter } : {}),
    // Include insertions arriving while an earlier job is draining its batch.
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
  });
}

/** Enqueue background refresh of board membership snapshot. Disabled in single project board mode. */
export async function enqueueBoardMembershipRefresh(_data: RefreshBoardMembershipJobData): Promise<string | null> {
  // Producer-off: single project board mode does not use membership jobs
  void _data;
  return null;
}

/** Register schedules and consumers. Called only by the standalone worker. */
export async function registerJobs(): Promise<PgBoss> {
  const boss = await startBoss();
  await registerQueues(boss);
  await registerSchedules(boss, env.pollIntervalMs);
  await registerWorkers(boss, {
    recordRun,
    enqueueJiraProjectSync,
    runPollJiraDispatch,
  });

  // OPS: Reconcile only stale or failing Jira projects on startup (avoid blind full queue flood)
  setTimeout(() => {
    void reconcileStartupJiraProjects().catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        job: "startup-reconciliation",
        message: "Startup Jira reconciliation failed",
        error: String(error),
      }));
    });
  }, 1000);

  return boss;
}

/**
 * On worker startup, inspect each project's cursor and enqueue only projects
 * that are stale (> JIRA_FRESHNESS_MINUTES) or currently failing. Healthy
 * projects are untouched to prevent unnecessary queue spikes.
 */
export async function reconcileStartupJiraProjects(): Promise<{
  checked: number;
  staleCount: number;
  queued: number;
  coalesced: number;
  errors: string[];
}> {
  const syncProjects = await listSyncEnabledProjectKeys();
  const health = await getWorkerHealth();
  const targetProjects = [...new Set([
    ...(health.staleProjects ?? []),
    ...(health.failingProjects ?? []),
  ])];

  console.info(JSON.stringify({
    level: "info",
    job: "startup-reconciliation",
    message: `Worker startup: checked ${syncProjects.length} projects, found ${targetProjects.length} stale/failing`,
    targetProjects,
  }));

  if (targetProjects.length === 0) {
    return { checked: syncProjects.length, staleCount: 0, queued: 0, coalesced: 0, errors: [] };
  }

  let queued = 0;
  let coalesced = 0;
  const errors: string[] = [];

  for (const projectKey of targetProjects) {
    try {
      const jobId = await enqueueJiraProjectSync({
        projectKey,
        full: false,
        source: "startup",
      });
      if (jobId) queued++;
      else coalesced++;
    } catch (err) {
      errors.push(`${projectKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    checked: syncProjects.length,
    staleCount: targetProjects.length,
    queued,
    coalesced,
    errors,
  };
}

export async function stopBoss(): Promise<void> {
  stopRegistryTimers();
  await stopBossConnection();
}
