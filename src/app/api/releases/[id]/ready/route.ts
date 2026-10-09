import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { aiProvider } from "@/lib/ai";
import { notifyAll } from "@/lib/notify";
import { evaluateReleaseGates } from "@/lib/releases/gates";
import {
  buildGateSourceTimes,
  buildReleaseCheckNotification,
} from "@/lib/releases/release-summary";
import { buildReleaseContext } from "@/lib/releases/release-context";
import { can } from "@/lib/permissions";
import {
  findReleaseById,
  persistReleaseCheckResult,
  listReleaseGateOverrides,
} from "@/lib/releases/repository";

/**
 * Run the release ready-check through the M3-03 gate engine.
 *
 * Fail-safe semantics preserved from M2-02:
 * - Empty release is always blocked (EMPTY_RELEASE).
 * - Unknown/stale data yields `unknown`, never `ready`.
 * - AI failure is advisory only and never makes a release ready.
 *
 * Results are persisted via repository to `ReleaseCheck` plus one `ReleaseGateResult`
 * row per gate (M3-02), the release status is updated, and a notification is sent
 * when the outcome actually changes (including becoming ready).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // REL-01 — running a ready-check is a release_manager/admin action.
  if (!can(session, "release.check")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const release = await findReleaseById(id);
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const releaseCtx = await buildReleaseContext(id, release.version);
  if (!releaseCtx) return NextResponse.json({ error: "could not build release context" }, { status: 500 });

  // REL-03 — load active gate overrides so the engine can mark overridden
  // gates as "overridden" rather than failed/unknown.
  const overrides = await listReleaseGateOverrides(id);

  const { status, ready, gates, blockers, summary } = await evaluateReleaseGates(
    releaseCtx,
    {
      releaseCheck: aiProvider.releaseCheck.bind(aiProvider),
      overrides,
    }
  );

  const check = await persistReleaseCheckResult(id, {
    status,
    summary,
    blockers,
    sourceTimes: buildGateSourceTimes(releaseCtx),
    gates,
    triggeredBy: session.user?.email ?? null,
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

