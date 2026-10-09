import type { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { listSyncEnabledProjectKeys } from "@/lib/jira/project-catalog";
import { getWorkerHealth } from "@/lib/health/worker-health";
import { runPollJiraDispatch } from "./workers/poll-jira-dispatch";
import type { WorkerLog } from "./guard";
import {
  startBoss,
  stopBoss as stopBossConnection,
} from "./connection";
import { registerQueues, registerWorkers, stopRegistryTimers } from "./registry";
import { registerSchedules } from "./schedules";
import { enqueueJiraProjectSync } from "./enqueue";

export { getBoss, startBoss } from "./connection";
export { JOB_NAMES, type JobName } from "./job-names";
export {
  enqueueBoardMembershipRefresh,
  enqueueBulkOperation,
  enqueueCheckBranches,
  enqueueJiraDispatch,
  enqueueJiraProjectSync,
  enqueueJiraSync,
  enqueueNotificationDelivery,
  enqueuePollPrComments,
  enqueueWebhookEvent,
  type JiraProjectSyncRequest,
} from "./enqueue";

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
