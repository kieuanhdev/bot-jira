import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getReleaseReadiness } from "@/lib/releases/release-readiness";
import { findReleaseById, updateReleaseMetadata } from "@/lib/releases/repository";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const release = await findReleaseById(id);

  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const readiness = await getReleaseReadiness(id);
  if (!readiness) return NextResponse.json({ error: "not found" }, { status: 404 });

  const isArchived = Boolean((release as { archived?: boolean }).archived);

  return NextResponse.json({
    item: {
      ...release,
      archived: isArchived,
      readiness: readiness.state,
      taskCount: readiness.taskCount,
      doneCount: readiness.doneCount,
      gitCompleteCount: readiness.gitCompleteCount,
      deliveryReadyCount: readiness.deliveryReadyCount,
      blockers: readiness.blockers,
      tasks: readiness.tasks,
      jiraDataFresh: readiness.jiraDataFresh,
      gitDataFresh: readiness.gitDataFresh,
      lastJiraSyncedAt: readiness.lastJiraSyncedAt,
      lastGitSyncedAt: readiness.lastGitSyncedAt,
      // Compatibility fields for legacy callers
      latestCheck: null,
      approvals: [],
      gateOverrides: [],
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    notes?: string;
    description?: string;
  };

  const release = await findReleaseById(id);
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await updateReleaseMetadata(id, {
    notes: body.notes,
    description: body.description,
  });

  await audit({
    actorId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    action: "release.update",
    source: "web",
    target: id,
    after: { notes: updated.notes, description: updated.description },
  });

  return NextResponse.json({ ok: true, item: updated });
}
