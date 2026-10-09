import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import {
  findReleaseById,
  createReleaseGateOverride,
  revokeReleaseGateOverride,
  NON_OVERRIDABLE_GATES,
} from "@/lib/releases/repository";

// REL-03 — gate overrides. POST adds an override (must name a gate + reason);
// DELETE revokes by override id. `non_empty_release` and `ci` can never be
// overridden (enforced by the gate engine's NON_OVERRIDABLE set, and re-checked
// here for a clear 400).

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
  if (NON_OVERRIDABLE_GATES.has(body.gate)) {
    return NextResponse.json({ error: `gate "${body.gate}" cannot be overridden` }, { status: 400 });
  }

  const release = await findReleaseById(id);
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const override = await createReleaseGateOverride(id, {
    gate: body.gate.trim(),
    reason: body.reason.trim(),
    createdById: session.user?.id ?? "",
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
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
  const url = new URL(req.url);
  const overrideId = params.overrideId || url.searchParams.get("overrideId");
  if (!overrideId) return NextResponse.json({ error: "overrideId required" }, { status: 400 });

  const updated = await revokeReleaseGateOverride(overrideId, id);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await audit({
    actorId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
    action: "release.override_revoke",
    source: "web",
    target: id,
    after: { gate: updated.gate, overrideId },
  });

  return NextResponse.json({ ok: true });
}
