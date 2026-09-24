import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getWorkerHealth, isJiraFresh } from "@/lib/health/worker-health";

export const dynamic = "force-dynamic";

/**
 * OPS-03 — Public (authenticated) freshness signal used by the in-app banner.
 *
 * Unlike /api/health (admin-only, probes every integration with live pings),
 * this endpoint reads only the precomputed worker/job liveness from the
 * IntegrationCursor read model, so it is cheap enough to poll from the UI and
 * safe for any signed-in user.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const health = await getWorkerHealth();

  return NextResponse.json({
    status: health.status,
    jiraFresh: isJiraFresh(health),
    workerAgeMs: health.workerAgeMs,
    jiraSyncAgeMs: health.jiraSyncAgeMs,
    checkedAt: health.checkedAt,
  });
}
