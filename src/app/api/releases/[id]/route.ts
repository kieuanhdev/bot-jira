import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const release = await prisma.release.findUnique({
    where: { id },
    include: {
      tasks: {
        select: {
          jiraKey: true,
          issue: {
            select: {
              status: true,
              statusCategory: true,
              summary: true,
              points: true,
              priority: true,
            },
          },
        },
      },
      releaseChecks: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          gates: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      approvals: {
        where: { revokedAt: null },
        orderBy: { approvedAt: "desc" },
      },
      gateOverrides: {
        where: { revokedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const doneCount = release.tasks.filter((t) => t.issue.statusCategory === "done").length;
  const latestCheck = release.releaseChecks[0] ?? null;

  return NextResponse.json({
    item: {
      ...release,
      taskCount: release.tasks.length,
      doneCount,
      latestCheck: latestCheck
        ? {
            id: latestCheck.id,
            status: latestCheck.status,
            summary: latestCheck.summary,
            blockers: latestCheck.blockers,
            createdAt: latestCheck.createdAt.toISOString(),
            gates: latestCheck.gates.map((g) => ({
              id: g.id,
              gate: g.gate,
              state: g.state,
              summary: g.summary,
              details: g.details,
              sourceTime: g.sourceTime ? g.sourceTime.toISOString() : null,
            })),
          }
        : null,
      approvals: release.approvals.map((a) => ({
        id: a.id,
        type: a.type,
        approvedById: a.approvedById,
        note: a.note,
        approvedAt: a.approvedAt.toISOString(),
      })),
      gateOverrides: release.gateOverrides.map((o) => ({
        id: o.id,
        gate: o.gate,
        reason: o.reason,
        createdById: o.createdById,
        createdAt: o.createdAt.toISOString(),
        expiresAt: o.expiresAt ? o.expiresAt.toISOString() : null,
      })),
    },
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.publish") && !can(session, "release.check")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    notes?: string;
    description?: string;
  };

  const release = await prisma.release.findUnique({ where: { id } });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.release.update({
    where: { id },
    data: {
      notes: typeof body.notes === "string" ? body.notes : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
    },
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
