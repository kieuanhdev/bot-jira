import { PgBoss } from "pg-boss";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { runCheckBranches } from "./workers/check-branches";
import { runAiScore } from "./workers/ai-score";
import { runSentryImport } from "./workers/sentry-import";
import { runStaleDetect } from "./workers/stale-detect";
import { runPollJira, type PollJiraJobData } from "./workers/poll-jira";
import type { WorkerLog } from "./guard";

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossStart?: Promise<PgBoss> };

export const JOB_NAMES = ["poll-jira", "check-branches", "ai-score", "sentry-import", "stale-detect"] as const;

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

/** Register schedules and consumers. Called only by the standalone worker. */
export async function registerJobs(): Promise<PgBoss> {
  const boss = await startBoss();
  await boss.createQueue("poll-jira", { policy: "singleton" });
  for (const name of JOB_NAMES.filter((item) => item !== "poll-jira")) {
    await boss.createQueue(name);
  }

  await boss.schedule("poll-jira", pollCron(), null, { singletonSeconds: 55, retryLimit: 3, retryDelay: 15, retryBackoff: true });
  await boss.schedule("check-branches", "*/5 * * * *", null, { singletonSeconds: 240, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("ai-score", "*/10 * * * *", null, { singletonSeconds: 540, retryLimit: 2, retryDelay: 30 });
  await boss.schedule("sentry-import", "*/5 * * * *", null, { singletonSeconds: 240, retryLimit: 3, retryDelay: 30, retryBackoff: true });
  await boss.schedule("stale-detect", "*/30 * * * *", null, { singletonSeconds: 1740, retryLimit: 2, retryDelay: 30 });

  await boss.work<PollJiraJobData>("poll-jira", async (jobs) => recordRun("poll-jira", () => runPollJira(jobs[0]?.data ?? {})));
  await boss.work("check-branches", async () => recordRun("check-branches", runCheckBranches));
  await boss.work("ai-score", async () => recordRun("ai-score", runAiScore));
  await boss.work("sentry-import", async () => recordRun("sentry-import", runSentryImport));
  await boss.work("stale-detect", async () => recordRun("stale-detect", runStaleDetect));
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (!globalForBoss.boss) return;
  await globalForBoss.boss.stop({ graceful: true, timeout: 30_000 });
  globalForBoss.boss = undefined;
  globalForBoss.bossStart = undefined;
}
