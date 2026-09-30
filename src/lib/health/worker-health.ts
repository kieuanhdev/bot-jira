import { prisma } from "@/lib/prisma";
import { env, jiraProjectList } from "@/lib/env";

// OPS-01 / OPS-03 — Worker + job liveness/freshness.
//
// The worker writes two kinds of `IntegrationCursor` rows (integration
// "worker"): one per named job (scope = job name) recording each run's
// started/success/error timestamps, plus a single "liveness" row written on a
// cadence so a crashed-but-still-running worker (pg-boss up, process wedged)
// is still detectable. Jira polling cursors (integration "jira", scope = projectKey)
// record per-project freshness.

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
  /** Milliseconds since the Jira poll last succeeded (null = never). Oldest across configured projects. */
  jiraSyncAgeMs: number | null;
  /** A job or project reported an error more recently than its last success. */
  hasErrors: boolean;
  jobs: JobState[];
  checkedAt: string;
  staleProjects?: string[];
  failingProjects?: string[];
  databaseError?: string | null;
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
 * - "down":    no liveness heartbeat, it is older than `workerDownMs`, or database query failed.
 * - "degraded": a project's latest activity is stale, or a job/project reported an error
 *               more recently than it last succeeded.
 * - "unknown": liveness was never recorded (fresh install, worker not run yet).
 * - "healthy": everything is within SLA.
 */
export async function getWorkerHealth(): Promise<WorkerHealth> {
  const now = Date.now();
  let dbError: string | null = null;
  let rows: Array<{
    integration: string;
    scope: string;
    lastStartedAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastError: string | null;
    stats: unknown;
  }> = [];

  try {
    rows = await prisma.integrationCursor.findMany({
      where: {
        OR: [
          { integration: HEARTBEAT_INTEGRATION },
          { integration: "jira" },
        ],
      },
      select: {
        integration: true,
        scope: true,
        lastStartedAt: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        lastError: true,
        stats: true,
      },
    });
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
  }

  const workerRows = rows.filter((r) => !r.integration || r.integration === HEARTBEAT_INTEGRATION);
  const jiraRows = rows.filter((r) => r.integration === "jira");

  const liveness = workerRows.find((r) => r.scope === LIVENESS_SCOPE);
  const jobs = workerRows.filter((r) => r.scope !== LIVENESS_SCOPE);

  const workerAgeMs = ageMs(liveness?.lastStartedAt, now);

  const configuredProjects = jiraProjectList;
  const staleProjects: string[] = [];
  const failingProjects: string[] = [];
  let jiraSyncAgeMs: number | null = null;
  let jiraStale = false;

  if (configuredProjects.length > 0) {
    let maxAgeMs: number | null = 0;
    for (const pKey of configuredProjects) {
      const pRow = jiraRows.find((r) => r.scope.toUpperCase() === pKey.toUpperCase());
      if (!pRow || !pRow.lastSuccessAt) {
        // Missing cursor row or no previous success -> project is always stale
        staleProjects.push(pKey);
        maxAgeMs = null;
      } else {
        const pAge = ageMs(pRow.lastSuccessAt, now);
        if (pAge === null || pAge > SLA.jiraStaleMs) {
          staleProjects.push(pKey);
        }
        if (maxAgeMs !== null && pAge !== null) {
          maxAgeMs = Math.max(maxAgeMs, pAge);
        }
      }

      if (pRow?.lastErrorAt) {
        const errTime = pRow.lastErrorAt instanceof Date ? pRow.lastErrorAt.getTime() : new Date(pRow.lastErrorAt).getTime();
        const succTime = pRow.lastSuccessAt ? (pRow.lastSuccessAt instanceof Date ? pRow.lastSuccessAt.getTime() : new Date(pRow.lastSuccessAt).getTime()) : 0;
        if (errTime > succTime) {
          failingProjects.push(pKey);
        }
      }
    }
    jiraSyncAgeMs = maxAgeMs;
    jiraStale = staleProjects.length > 0;
  } else {
    // Fallback to legacy poll-jira row only when no projects are configured
    const jiraRow = jobs.find((r) => r.scope === "poll-jira");
    jiraSyncAgeMs = ageMs(jiraRow?.lastSuccessAt, now);
    jiraStale = jiraSyncAgeMs !== null && jiraSyncAgeMs > SLA.jiraStaleMs;
  }

  let hasErrors = Boolean(dbError);
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

  if (failingProjects.length > 0) {
    hasErrors = true;
    anyErrorRecent = true;
  }

  const workerNeverSeen = liveness ? false : rows.length === 0 && !dbError;
  const workerDown = workerAgeMs === null ? !workerNeverSeen : workerAgeMs > SLA.workerDownMs;

  let status: WorkerHealth["status"];
  if (dbError) {
    // Database errors must not be swallowed into a healthy or ambiguous state
    status = "down";
  } else if (workerNeverSeen) {
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
    staleProjects,
    failingProjects,
    databaseError: dbError,
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
  if (health.databaseError || health.status === "down" || health.status === "unknown") return false;
  if (health.staleProjects && health.staleProjects.length > 0) return false;
  return health.jiraSyncAgeMs !== null && health.jiraSyncAgeMs <= SLA.jiraStaleMs;
}

export { SLA };
