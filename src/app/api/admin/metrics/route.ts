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
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const worker = await getWorkerHealth();

  const now = Date.now();
  const oneDayAgo = new Date(now - 24 * 3600_000);
  const fiveMinAgo = new Date(now - 5 * 60_000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 3600_000);

  const [
    outbox,
    sentry,
    releases,
    gateResults,
    aiScores,
    aiDecisions,
    aiFallbackCount,
    bulkOps,
    webhook24h,
    webhookErrors24h,
    webhookUnprocessed,
    webhookRecent,
  ] = await Promise.all([
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
    prisma.aiScore.count({
      where: {
        points: defaultPoint,
        OR: [{ confidence: null }, { confidence: { lte: 0.3 } }],
      },
    }),
    prisma.bulkOperation.groupBy({
      by: ["state"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
    }),
    prisma.integrationEvent.groupBy({
      by: ["source"],
      where: { receivedAt: { gte: oneDayAgo } },
      _count: { _all: true },
    }),
    prisma.integrationEvent.groupBy({
      by: ["source"],
      where: { receivedAt: { gte: oneDayAgo }, processingError: { not: null } },
      _count: { _all: true },
    }),
    prisma.integrationEvent.groupBy({
      by: ["source"],
      where: { processedAt: null, receivedAt: { lte: fiveMinAgo } },
      _count: { _all: true },
    }),
    prisma.integrationEvent.findMany({
      orderBy: { receivedAt: "desc" },
      take: 50,
      select: { source: true, receivedAt: true, processingError: true },
    }),
  ]);

  let queues: Array<{
    name: string;
    queuedCount: number;
    readyCount: number;
    activeCount: number;
    failedCount: number;
    history?: Array<{
      time: string;
      completed: number;
      failed: number;
      active: number;
      ready: number;
    }>;
  }> | null = null;
  try {
    const { startBoss } = await import("@/lib/queue/boss");
    const boss = await startBoss();
    const qList = await boss.getQueues();
    queues = await Promise.all(
      qList.map(async (q) => {
        let history: Array<{
          time: string;
          completed: number;
          failed: number;
          active: number;
          ready: number;
        }> = [];
        try {
          const stats = await boss.getQueueStats(q.name, {
            from: oneDayAgo,
            maxDataPoints: 24,
            aggregate: "max",
          });
          if (Array.isArray(stats)) {
            history = stats.map((s) => ({
              time: (s.deltaOn ?? s.capturedOn ?? new Date()).toISOString(),
              completed: s.completedDelta ?? 0,
              failed: s.failedDelta ?? 0,
              active: s.activeCount ?? 0,
              ready: s.readyCount ?? 0,
            }));
          }
        } catch {
          history = [];
        }
        return {
          name: q.name,
          queuedCount: q.queuedCount,
          readyCount: q.readyCount,
          activeCount: q.activeCount,
          failedCount: q.failedCount,
          history,
        };
      })
    );
  } catch {
    queues = null;
  }

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

  // Webhooks aggregation
  const sources = new Set<string>(["jira", "bitbucket"]);
  for (const r of webhook24h) sources.add(r.source);
  for (const r of webhookRecent) sources.add(r.source);

  const lastReceivedBySource: Record<string, string | null> = {};
  for (const r of webhookRecent) {
    if (!lastReceivedBySource[r.source]) {
      lastReceivedBySource[r.source] = r.receivedAt.toISOString();
    }
  }

  const webhooksBySource: Record<string, {
    source: string;
    count24h: number;
    unprocessed: number;
    errors24h: number;
    lastReceivedAt: string | null;
  }> = {};

  for (const src of sources) {
    webhooksBySource[src] = {
      source: src,
      count24h: webhook24h.find((r) => r.source === src)?._count._all ?? 0,
      unprocessed: webhookUnprocessed.find((r) => r.source === src)?._count._all ?? 0,
      errors24h: webhookErrors24h.find((r) => r.source === src)?._count._all ?? 0,
      lastReceivedAt: lastReceivedBySource[src] ?? null,
    };
  }

  const bulkOpsByState: Record<string, number> = {};
  for (const b of bulkOps) {
    bulkOpsByState[b.state] = b._count._all;
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
    bulkOps: bulkOpsByState,
    webhooks: webhooksBySource,
    queues,
    ai: {
      scores: aiScores,
      fallbackScores: aiFallbackCount,
      realScores: Math.max(0, aiScores - aiFallbackCount),
      decisions: byDecision(aiDecisions),
      defaultPoint,
      pointScale,
    },
  });
}
