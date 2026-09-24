import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getWorkerHealth, isJiraFresh } from "@/lib/health/worker-health";
import { pointScale, defaultPoint } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * OBS-01 — Operational metrics (admin-only).
 *
 * Aggregates, from the read models, the signals an operator needs to watch a
 * pilot:
 *  - worker liveness + job success/error counts (from IntegrationCursor)
 *  - notification outbox pending/sent/failed
 *  - sentry import pending/created/failed/ignored
 *  - release counts by status
 *  - latest release-check gate states (failure/unknown by gate)
 *  - AI estimation decision mix + a provider-unavailable marker
 *
 * It is a point-in-time snapshot (no time series) so it stays cheap; the
 * per-job durations/errors live in IntegrationCursor.stats for drill-down.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "release_manager") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const worker = await getWorkerHealth();

  const [outbox, sentry, releases, gateResults, aiScores, aiDecisions] = await Promise.all([
    prisma.notificationOutbox.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.sentryIssueImported.groupBy({ by: ["state"], _count: { _all: true } }),
    prisma.release.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.releaseGateResult.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { gate: true, state: true, createdAt: true },
    }),
    prisma.aiScore.count(),
    prisma.aiEstimateDecision.groupBy({ by: ["decision"], _count: { _all: true } }),
  ]);

  const byState = (rows: { state: string; _count: { _all: number } }[]) => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.state] = r._count._all;
    return out;
  };
  const byStatus = (rows: { status: string; _count: { _all: number } }[]) => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  };
  const byDecision = (rows: { decision: string; _count: { _all: number } }[]) => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.decision] = r._count._all;
    return out;
  };

  // Gate failure/unknown rollup over the most recent gate results.
  const gateByState: Record<string, Record<string, number>> = {};
  for (const g of gateResults) {
    gateByState[g.gate] ??= { passed: 0, failed: 0, unknown: 0, overridden: 0 };
    if (g.state in gateByState[g.gate]) gateByState[g.gate][g.state as "passed"] = (gateByState[g.gate][g.state as "passed"] ?? 0) + 1;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    worker: {
      status: worker.status,
      jiraFresh: isJiraFresh(worker),
      jiraSyncAgeMs: worker.jiraSyncAgeMs,
      workerAgeMs: worker.workerAgeMs,
      jobs: worker.jobs,
    },
    outbox: byState(outbox),
    sentryImport: byState(sentry),
    releasesByStatus: byStatus(releases),
    gatesByState: gateByState,
    ai: {
      scores: aiScores,
      decisions: byDecision(aiDecisions),
      // A score row with a default point and low confidence is a heuristic
      // fallback, not a real provider estimate; surfaced for the pilot so a
      // provider outage is not miscounted as AI success.
      defaultPoint,
      pointScale,
    },
  });
}
