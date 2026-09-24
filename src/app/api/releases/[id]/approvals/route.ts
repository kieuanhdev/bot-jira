import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

// REL-03 — manual approvals. POST adds an approval (actor = session user);
// the type is inferred from the actor's role (admin/release_manager =>
// "release_manager", others => "qa") unless the caller explicitly passes one.
// DELETE revokes by approval id.

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.approve")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await _req.json().catch(() => ({}))) as { type?: string; note?: string };

  const release = await prisma.release.findUnique({ where: { id }, select: { id: true } });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const role = session.user?.role ?? "member";
  const type = body.type ?? (role === "member" ? "qa" : "release_manager");
  if (!["qa", "release_manager"].includes(type)) {
    return NextResponse.json({ error: "invalid approval type" }, { status: 400 });
  }

  const approval = await prisma.releaseApproval.create({
    data: {
      releaseId: id,
      type,
      approvedById: session.user?.id ?? "",
      note: body.note ?? "",
    },
  });

  await audit({
    actorId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    action: "release.approve",
    source: "web",
    target: id,
    after: { type, approvalId: approval.id },
  });

  return NextResponse.json({ approval });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; approvalId?: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.approve")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const params = await ctx.params;
  const id = params.id;
  const approvalId = params.approvalId;
  if (!approvalId) return NextResponse.json({ error: "approvalId required" }, { status: 400 });

  const approval = await prisma.releaseApproval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.releaseId !== id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Only the approver or an admin can revoke.
  if (approval.approvedById !== session.user?.id && session.user?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.releaseApproval.update({ where: { id: approvalId }, data: { revokedAt: new Date() } });

  await audit({
    actorId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    action: "release.approve_revoke",
    source: "web",
    target: id,
    after: { approvalId },
  });

  return NextResponse.json({ ok: true });
}
