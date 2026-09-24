import { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { runCheckBranches } from "./workers/check-branches";
import { runAiScore } from "./workers/ai-score";
import { runSentryImport } from "./workers/sentry-import";
import { runStaleDetect } from "./workers/stale-detect";
import { runPollJira, type PollJiraJobData } from "./workers/poll-jira";
import { runBulkOperation } from "./workers/bulk-op";
import { runProcessWebhook, type ProcessWebhookJobData } from "./workers/process-webhook";
import { runDeliverNotifications } from "./workers/deliver-notifications";
import { runParseCommentBranches } from "./workers/parse-comment-branches";
import { runHealthAlert } from "./workers/health-alert";
import { runPollPrComments } from "./workers/poll-pr-comments";
import type { WorkerLog } from "./guard";

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossStart?: Promise<PgBoss> };

export const JOB_NAMES = [
  "poll-jira",
  "check-branches",
  "parse-comment-branches",
  "poll-pr-comments",
  "ai-score",
  "sentry-import",
  "stale-detect",
  "bulk-op",
  "process-webhook",
  "deliver-notifications",
  "health-alert",
] as const;

export function getBoss(): PgBoss {
  if (!globalForBoss.boss) globalForBoss.boss = new PgBoss(env.databaseUrl);
  return globalForBoss.boss;
}

export async function startBoss(): Promise<PgBoss> {
  if (!globalForBoss.bossStart) {
    const boss = getBoss();
    globalForBoss.bossStart = boss.start().catch((error) => {
      globalForBoss.bossStart = undefined;
      throw error;
    });
  }
  return globalForBoss.bossStart;
}

function pollCron(): string {
  const minutes = Math.max(1, Math.min(59, Math.round(env.pollIntervalMs / 60_000)));
  return minutes === 1 ? "* * * * *" : `*/${minutes} * * * *`;
}

async function recordRun(name: string, run: () => Promise<WorkerLog>): Promise<WorkerLog> {
  const cursor = await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: "worker", scope: name } },
    create: { integration: "worker", scope: name, lastStartedAt: new Date() },
    update: { lastStartedAt: new Date(), lastError: null },
  });
  try {
    const result = await run();
    const errorText = result.ok ? null : (result.errors ?? [result.reason ?? "Worker failed"]).join("; ").slice(0, 2000);
    await prisma.integrationCursor.update({
      where: { id: cursor.id },
      data: {
        lastSuccessAt: result.ok ? new Date() : cursor.lastSuccessAt,
        lastErrorAt: result.ok ? null : new Date(),
        lastError: errorText,
        stats: { ...(result.stats ?? {}), skipped: Boolean(result.skipped), reason: result.reason ?? null },
      },
    });
    if (!result.ok) throw new Error(errorText ?? `${name} failed`);
    return result;
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
    await prisma.integrationCursor.update({
      where: { id: cursor.id },
      data: { lastErrorAt: new Date(), lastError: message },
    }).catch(() => null);
    throw error;
  }
}

export async function enqueueJiraSync(data: PollJiraJobData): Promise<string | null> {
  const boss = await startBoss();
  const key = data.projectKey?.toUpperCase() ?? "all";
  return boss.send("poll-jira", data, {
    singletonKey: key,
    singletonSeconds: 30,
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
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

/** Register schedules and consumers. Called only by the standalone worker. */
export async function registerJobs(): Promise<PgBoss> {
  const boss = await startBoss();
  await boss.createQueue("poll-jira", { policy: "singleton" });
  for (const name of JOB_NAMES.filter((item) => item !== "poll-jira")) {
    await boss.createQueue(name);
  }

  await boss.schedule("poll-jira", pollCron(), null, { singletonSeconds: 55, retryLimit: 3, retryDelay: 15, retryBackoff: true });
  await boss.schedule("check-branches", "*/5 * * * *", null, { singletonSeconds: 240, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("parse-comment-branches", "*/5 * * * *", null, { singletonSeconds: 240, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("poll-pr-comments", "*/2 * * * *", null, { singletonSeconds: 110, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("ai-score", "*/10 * * * *", null, { singletonSeconds: 540, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("sentry-import", "*/5 * * * *", null, { singletonSeconds: 240, retryLimit: 3, retryDelay: 30, retryBackoff: true });
  await boss.schedule("stale-detect", "*/30 * * * *", null, { singletonSeconds: 1740, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("deliver-notifications", "* * * * *", null, { singletonSeconds: 55, retryLimit: 3, retryDelay: 15, retryBackoff: true });
  // OPS-03 — freshness/health alerting, deduped by the alert worker itself.
  await boss.schedule("health-alert", "*/5 * * * *", null, { singletonSeconds: 240, retryLimit: 2, retryDelay: 30 });

  await boss.work<PollJiraJobData>("poll-jira", async (jobs) => recordRun("poll-jira", () => runPollJira(jobs[0]?.data ?? {})));
  await boss.work("check-branches", async () => recordRun("check-branches", runCheckBranches));
  await boss.work("parse-comment-branches", async () => recordRun("parse-comment-branches", runParseCommentBranches));
  await boss.work("poll-pr-comments", async () => recordRun("poll-pr-comments", runPollPrComments));
  await boss.work("ai-score", async () => recordRun("ai-score", runAiScore));
  await boss.work("sentry-import", async () => recordRun("sentry-import", runSentryImport));
  await boss.work("stale-detect", async () => recordRun("stale-detect", runStaleDetect));
  await boss.work("health-alert", async () => recordRun("health-alert", runHealthAlert));
  // M5 — webhook processing: one-off jobs enqueued by the webhook endpoints.
  await boss.work<ProcessWebhookJobData>("process-webhook", async (jobs) => {
    const data = jobs[0]?.data ?? { source: "jira", eventId: "" };
    try {
      const result = await runProcessWebhook(data);
      return { ok: result.ok, stats: result.stats, errors: result.errors };
    } catch (error) {
      return { ok: false, errors: [(error as Error).message] };
    }
  });
  // M5 — outbox delivery: send due pushes with retry/backoff.
  await boss.work("deliver-notifications", async () => recordRun("deliver-notifications", runDeliverNotifications));
  // M4 — bulk operations are one-off jobs (not scheduled). We wrap them in a
  // minimal log so failures are visible, but the operation's own state
  // (completed / partially_failed / failed) is the source of truth.
  await boss.work<{ operationId: string }>("bulk-op", async (jobs) => {
    const data = jobs[0]?.data ?? { operationId: "" };
    try {
      await runBulkOperation(data.operationId);
      return { ok: true, stats: { operationId: data.operationId } };
    } catch (error) {
      return { ok: false, errors: [(error as Error).message] };
    }
  });
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (!globalForBoss.boss) return;
  await globalForBoss.boss.stop({ graceful: true, timeout: 30_000 });
  globalForBoss.boss = undefined;
  globalForBoss.bossStart = undefined;
}
