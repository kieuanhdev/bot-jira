import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

// OPS-01 / OPS-03 — Worker + job liveness/freshness.
//
// The worker writes two kinds of `IntegrationCursor` rows (integration
// "worker"): one per named job (scope = job name) recording each run's
// started/success/error timestamps, plus a single "liveness" row written on a
// cadence so a crashed-but-still-running worker (pg-boss up, process wedged)
// is still detectable. This module centralises how those rows are read so the
// admin health endpoint, the public freshness endpoint and the alert worker
// all classify health the same way.

const LIVENESS_SCOPE = "liveness";

export const HEARTBEAT_INTEGRATION = "worker";

export type JobState = {
  job: string;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  stats: Record<string, unknown> | null;
};

export type WorkerHealth = {
  /** "healthy" | "degraded" | "down" | "unknown" */
  status: "healthy" | "degraded" | "down" | "unknown";
  /** Milliseconds since the worker last wrote a liveness heartbeat. */
  workerAgeMs: number | null;
  /** Milliseconds since the Jira poll last succeeded (null = never). */
  jiraSyncAgeMs: number | null;
  /** A job reported an error more recently than its last success. */
  hasErrors: boolean;
  jobs: JobState[];
  checkedAt: string;
};

const SLA = {
  /** Worker liveness is "down" after this gap (plan: 2 minutes). */
  workerDownMs: 2 * 60_000,
  /** Jira cursor is "degraded" after this gap (plan: 5 minutes). */
  jiraStaleMs: env.jiraFreshnessMinutes * 60_000,
};

function ageMs(ts: Date | null | undefined, now: number): number | null {
  if (!ts) return null;
  const t = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, now - t);
}

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function writeWorkerHeartbeat(): Promise<void> {
  await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: HEARTBEAT_INTEGRATION, scope: LIVENESS_SCOPE } },
    create: { integration: HEARTBEAT_INTEGRATION, scope: LIVENESS_SCOPE, lastStartedAt: new Date() },
    update: { lastStartedAt: new Date(), lastSuccessAt: new Date() },
  });
}

/**
 * Classify worker + job liveness from the IntegrationCursor read model.
 *
 * - "down":    no liveness heartbeat, or it is older than `workerDownMs`.
 * - "degraded": a job's latest activity is stale, or a job reported an error
 *               more recently than it last succeeded.
 * - "unknown": liveness was never recorded (fresh install, worker not run yet).
 * - "healthy": everything is within SLA.
 */
export async function getWorkerHealth(): Promise<WorkerHealth> {
  const now = Date.now();
  const rows = await prisma.integrationCursor.findMany({
    where: { integration: HEARTBEAT_INTEGRATION },
    select: {
      scope: true,
      lastStartedAt: true,
      lastSuccessAt: true,
      lastErrorAt: true,
      lastError: true,
      stats: true,
    },
  }).catch(() => []);

  const liveness = rows.find((r) => r.scope === LIVENESS_SCOPE);
  const jobs = rows.filter((r) => r.scope !== LIVENESS_SCOPE);

  const workerAgeMs = ageMs(liveness?.lastStartedAt, now);
  const jiraRow = jobs.find((r) => r.scope === "poll-jira");
  const jiraSyncAgeMs = ageMs(jiraRow?.lastSuccessAt, now);

  let hasErrors = false;
  let anyErrorRecent = false;
  for (const r of jobs) {
    if (r.lastErrorAt && r.lastSuccessAt) {
      const e = r.lastErrorAt instanceof Date ? r.lastErrorAt.getTime() : new Date(r.lastErrorAt).getTime();
      const s = r.lastSuccessAt instanceof Date ? r.lastSuccessAt.getTime() : new Date(r.lastSuccessAt).getTime();
      if (!Number.isNaN(e) && e > s) anyErrorRecent = true;
    } else if (r.lastErrorAt) {
      anyErrorRecent = true;
    }
    if (r.lastError) hasErrors = true;
  }

  // Jira sync only degrades health once the worker has actually run (we have
  // job rows); on a brand-new install the absence of a poll-jira row is not a
  // staleness signal by itself.
  const jiraStale = jiraSyncAgeMs !== null && jiraSyncAgeMs > SLA.jiraStaleMs;
  const workerNeverSeen = liveness ? false : rows.length === 0;
  const workerDown = workerAgeMs === null ? !workerNeverSeen : workerAgeMs > SLA.workerDownMs;

  let status: WorkerHealth["status"];
  if (workerNeverSeen) {
    status = "unknown";
  } else if (workerDown) {
    status = "down";
  } else if (jiraStale || anyErrorRecent) {
    status = "degraded";
  } else {
    status = "healthy";
  }

  return {
    status,
    workerAgeMs,
    jiraSyncAgeMs,
    hasErrors,
    jobs: jobs.map((r) => ({
      job: r.scope,
      lastStartedAt: toIso(r.lastStartedAt),
      lastSuccessAt: toIso(r.lastSuccessAt),
      lastErrorAt: toIso(r.lastErrorAt),
      lastError: r.lastError,
      stats: (r.stats as Record<string, unknown> | null) ?? null,
    })),
    checkedAt: new Date(now).toISOString(),
  };
}

/** Convenience for the public endpoint: is Jira sync fresh? */
export function isJiraFresh(health: WorkerHealth): boolean {
  return health.jiraSyncAgeMs !== null && health.jiraSyncAgeMs <= SLA.jiraStaleMs;
}

export { SLA };
