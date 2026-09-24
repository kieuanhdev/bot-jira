import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

// REL-03 — gate overrides. POST adds an override (must name a gate + reason);
// DELETE revokes by override id. `non_empty_release` and `ci` can never be
// overridden (enforced by the gate engine's NON_OVERRIDABLE set, and re-checked
// here for a clear 400).

const NON_OVERRIDABLE = new Set(["non_empty_release", "ci"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.approve")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    gate?: string;
    reason?: string;
    expiresAt?: string;
  };

  if (!body.gate || !body.gate.trim()) {
    return NextResponse.json({ error: "gate required" }, { status: 400 });
  }
  if (!body.reason || !body.reason.trim()) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }
  if (NON_OVERRIDABLE.has(body.gate)) {
    return NextResponse.json({ error: `gate "${body.gate}" cannot be overridden` }, { status: 400 });
  }

  const release = await prisma.release.findUnique({ where: { id }, select: { id: true } });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const override = await prisma.releaseGateOverride.create({
    data: {
      releaseId: id,
      gate: body.gate.trim(),
      reason: body.reason.trim(),
      createdById: session.user?.id ?? "",
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  await audit({
    actorId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    action: "release.override",
    source: "web",
    target: id,
    after: { gate: override.gate, overrideId: override.id },
  });

  return NextResponse.json({ override });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; overrideId?: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(session, "release.approve")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const params = await ctx.params;
  const id = params.id;
  const overrideId = params.overrideId;
  if (!overrideId) return NextResponse.json({ error: "overrideId required" }, { status: 400 });

  const override = await prisma.releaseGateOverride.findUnique({ where: { id: overrideId } });
  if (!override || override.releaseId !== id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await prisma.releaseGateOverride.update({ where: { id: overrideId }, data: { revokedAt: new Date() } });

  await audit({
    actorId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    action: "release.override_revoke",
    source: "web",
    target: id,
    after: { gate: override.gate, overrideId },
  });

  return NextResponse.json({ ok: true });
}
