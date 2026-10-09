import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { aiProvider } from "@/lib/ai";
import { notifyAll } from "@/lib/notify";
import { evaluateReleaseGates } from "@/lib/releases/gates";
import {
  buildGateSourceTimes,
  buildGatePersistencePayload,
  buildReleaseCheckNotification,
} from "@/lib/releases/release-summary";
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
 * the outcome actually changes (including becoming ready).
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
    select: { id: true, version: true, status: true },
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

  const { status, ready, gates, blockers, summary } = await evaluateReleaseGates(
    releaseCtx,
    {
      releaseCheck: aiProvider.releaseCheck.bind(aiProvider),
      overrides,
    }
  );

  await prisma.release.update({
    where: { id },
    data: { status: status as "ready" | "blocked" | "unknown" },
  });

  const check = await prisma.releaseCheck.create({
    data: {
      releaseId: id,
      triggeredBy: session.user?.email ?? null,
      status,
      summary,
      blockers: JSON.parse(JSON.stringify(blockers)) as object,
      sourceTimes: JSON.parse(JSON.stringify(buildGateSourceTimes(releaseCtx))) as object,
      gates: {
        create: buildGatePersistencePayload(gates),
      },
    },
    include: { gates: true },
  });

  if (release.status !== status) {
    const notification = buildReleaseCheckNotification(
      release,
      status,
      blockers,
      summary,
      check.id
    );
    await notifyAll(notification).catch(() => null);
  }

  return NextResponse.json({
    status,
    ready,
    gates,
    blockers,
    checkId: check.id,
    tasks: releaseCtx.tasks,
    dependencyGraph: releaseCtx.dependencyGraph,
  });
}

