import { prisma } from "@/lib/prisma";
import { env, jiraProjectList } from "@/lib/env";
import { listSyncDisabledProjectKeys } from "@/lib/jira/project-catalog";
import { getSystemJiraAuth } from "@/lib/jira/client";
import { syncJiraDevStatusForIssue } from "@/lib/jira/dev-status";
import type { WorkerLog } from "../guard";

const INTEGRATION = "jira-dev-status";
const SCOPE = "global";

/** Round-robin batch of open tasks checked per run. */
const BATCH_SIZE = 60;
/** Tasks changed in Jira very recently are always checked first. */
const RECENT_BATCH_SIZE = 30;
const RECENT_WINDOW_MS = 15 * 60_000;
/** Tasks untouched in Jira for longer than this are not worth re-checking. */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const CONCURRENCY = 3;
/** Stay inside the job's 300s expiry. */
const TIME_BUDGET_MS = 200_000;

/**
 * Pulls the branches / pull requests Jira already links to each task (Jira Dev-Status)
 * into BranchInfo, so a task shows its branches without relying on the branch name
 * containing the Jira key. Walks open tasks round-robin using IntegrationCursor.cursor.
 */
export async function runSyncDevStatus(): Promise<WorkerLog> {
  if (!env.jiraBaseUrl) return { ok: true, skipped: true, reason: "Jira not configured" };
  const auth = await getSystemJiraAuth();
  if (!auth) return { ok: true, skipped: true, reason: "No Jira credentials for system sync" };

  const startedAt = new Date();
  const cursorRow = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: INTEGRATION, scope: SCOPE } },
    select: { cursor: true },
  });
  const after = cursorRow?.cursor ?? "";

  const syncDisabled = [...(await listSyncDisabledProjectKeys())];
  const inScope = {
    deletedAt: null,
    ...(jiraProjectList.length > 0 ? { projectKey: { in: jiraProjectList } } : {}),
    ...(syncDisabled.length > 0 ? { NOT: { projectKey: { in: syncDisabled } } } : {}),
    updatedAt: { gt: new Date(Date.now() - MAX_AGE_MS) },
  };

  const [recent, roundRobin] = await Promise.all([
    prisma.issueCache.findMany({
      where: { ...inScope, updatedAt: { gt: new Date(Date.now() - RECENT_WINDOW_MS) } },
      orderBy: { updatedAt: "desc" },
      take: RECENT_BATCH_SIZE,
      select: { jiraKey: true },
    }),
    prisma.issueCache.findMany({
      where: { AND: [inScope, { jiraKey: { gt: after } }] },
      orderBy: { jiraKey: "asc" },
      take: BATCH_SIZE,
      select: { jiraKey: true },
    }),
  ]);

  const keys = Array.from(new Set([...recent, ...roundRobin].map((i) => i.jiraKey)));
  const errors: string[] = [];
  let checked = 0;
  let linked = 0;
  let skippedEmpty = 0;
  let lastProcessedRoundRobin: string | null = null;
  const roundRobinKeys = new Set(roundRobin.map((i) => i.jiraKey));
  let timedOut = false;

  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    if (Date.now() - startedAt.getTime() > TIME_BUDGET_MS) {
      timedOut = true;
      break;
    }
    const chunk = keys.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((key) => syncJiraDevStatusForIssue(key, auth, { skipIfEmpty: true }))
    );
    results.forEach((res, idx) => {
      const key = chunk[idx];
      checked++;
      // Advance past failed tasks too, so one bad task cannot pin the cursor.
      if (roundRobinKeys.has(key) && (!lastProcessedRoundRobin || key > lastProcessedRoundRobin)) {
        lastProcessedRoundRobin = key;
      }
      if (!res.ok) {
        console.warn(JSON.stringify({ level: "warn", job: "sync-dev-status", jiraKey: key, error: res.error }));
        errors.push(`${key}: ${res.error ?? "sync failed"}`);
        return;
      }
      if (res.skipped) skippedEmpty++;
      linked += res.syncedBranches.length;
    });
  }

  // Wrap to the start once the last page of tasks has been fully processed.
  const finishedPage = !timedOut && roundRobin.length < BATCH_SIZE;
  const nextCursor = finishedPage ? null : lastProcessedRoundRobin ?? after;
  const failedAll = checked > 0 && errors.length === checked;
  const stats = { checked, linked, skippedEmpty, errorsCount: errors.length, wrapped: finishedPage };

  await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: INTEGRATION, scope: SCOPE } },
    update: {
      cursor: nextCursor,
      lastStartedAt: startedAt,
      ...(failedAll
        ? { lastErrorAt: new Date(), lastError: errors.join("; ").slice(0, 500) }
        : { lastSuccessAt: new Date(), lastError: null }),
      stats,
    },
    create: {
      integration: INTEGRATION,
      scope: SCOPE,
      cursor: nextCursor,
      lastStartedAt: startedAt,
      lastSuccessAt: failedAll ? null : new Date(),
      lastErrorAt: failedAll ? new Date() : null,
      lastError: failedAll ? errors.join("; ").slice(0, 500) : null,
      stats,
    },
  });

  return { ok: !failedAll, stats, errors: errors.length > 0 ? errors.slice(0, 20) : undefined };
}
