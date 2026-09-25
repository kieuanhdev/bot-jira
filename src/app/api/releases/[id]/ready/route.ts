import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { aiProvider } from "@/lib/ai";
import { notifyAll } from "@/lib/notify";
import {
  runGates,
  aggregateGates,
  collectBlockers,
} from "@/lib/releases/gates";
import { buildReleaseContext } from "@/lib/releases/release-context";
import { can } from "@/lib/permissions";

/**
 * Run the release ready-check through the M3-03 gate engine.
 *
 * Fail-safe semantics preserved from M2-02:
 * - Empty release is always blocked (EMPTY_RELEASE).
 * - Unknown/stale data yields `unknown`, never `ready`.
 * - AI failure is advisory only and never makes a release ready.
 *
 * Results are persisted to `ReleaseCheck` plus one `ReleaseGateResult` row per
 * gate (M3-02), the release status is updated, and a notification is sent when
 * the outcome is blocked or unknown.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // REL-01 — running a ready-check is a release_manager/admin action.
  if (!can(session, "release.check")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const release = await prisma.release.findUnique({
    where: { id },
    select: { id: true, version: true },
  });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const releaseCtx = await buildReleaseContext(id, release.version);
  if (!releaseCtx) return NextResponse.json({ error: "could not build release context" }, { status: 500 });

  // REL-03 — load active gate overrides so the engine can mark overridden
  // gates as "overridden" rather than failed/unknown.
  const overrides = await prisma.releaseGateOverride.findMany({
    where: { releaseId: id },
    select: { gate: true, revokedAt: true, expiresAt: true, createdAt: true, reason: true, createdById: true },
  });

  const gates = await runGates(releaseCtx, aiProvider.releaseCheck.bind(aiProvider), {
    overrides,
  });
  const status = aggregateGates(gates);
  const allBlockers = collectBlockers(gates);

  await prisma.release.update({
    where: { id },
    data: { status: status as "ready" | "blocked" | "unknown" },
  });

  const summary = gates.map((g) => `${g.gate}=${g.state}`).join(", ");

  const check = await prisma.releaseCheck.create({
    data: {
      releaseId: id,
      triggeredBy: session.user?.email ?? null,
      status,
      summary,
      blockers: JSON.parse(JSON.stringify(allBlockers)) as object,
      sourceTimes: JSON.parse(JSON.stringify({
        checkedAt: releaseCtx.checkedAt.toISOString(),
        taskLastSynced: releaseCtx.tasks.map((t) => ({ key: t.jiraKey, at: t.lastSyncedAt.toISOString() })),
        sentryCheckedAt: releaseCtx.sentryCheckedAt?.toISOString() ?? null,
      })) as object,
      gates: {
        create: gates.map((g) => ({
          gate: g.gate,
          state: g.state,
          summary: g.summary,
          details: g.details
            ? (JSON.parse(JSON.stringify(g.details)) as object)
            : undefined,
          sourceTime: g.sourceTime ?? null,
        })),
      },
    },
    include: { gates: true },
  });

  if (status === "blocked" || status === "unknown") {
    const reasons = allBlockers
      .slice(0, 10)
      .map((b) => (b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason));
    const severity = status === "blocked" ? "danger" : "warning";
    await notifyAll({
      type: "release",
      title: `Bản phát hành ${release.version} ${status === "blocked" ? "bị chặn" : "chưa sẵn sàng"}`,
      body: reasons.join("; ") || summary,
      link: "/release",
      severity,
      eventKey: `release-check:${check.id}:${status}`,
    }).catch(() => null);
  }

  return NextResponse.json({
    status,
    ready: status === "ready",
    gates,
    blockers: allBlockers,
    checkId: check.id,
    tasks: releaseCtx.tasks,
    dependencyGraph: releaseCtx.dependencyGraph,
  });
}
