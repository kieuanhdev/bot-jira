import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const KNOWN_TYPES = ["comment", "release", "transition", "stale", "ai", "sentry", "ci", "system"] as const;

/**
 * M5-03 — Notification preferences.
 *
 * GET  -> the current user's preference (defaults: nothing disabled, instant).
 * PATCH -> update disabledTypes / deliveryMode / digestHour.
 *
 * Preferences are per-user and only affect *delivery* of push notifications
 * and the in-app inbox; they never change what gets recorded in Jira.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId: session.user.id },
  });
  return NextResponse.json({
    disabledTypes: pref?.disabledTypes ?? [],
    deliveryMode: pref?.deliveryMode ?? "instant",
    digestHour: pref?.digestHour ?? 8,
    knownTypes: KNOWN_TYPES,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    disabledTypes?: string[];
    deliveryMode?: string;
    digestHour?: number;
  };

  const disabledTypes = Array.isArray(body.disabledTypes)
    ? [...new Set(body.disabledTypes.filter((t) => (KNOWN_TYPES as readonly string[]).includes(t)))]
    : undefined;
  const deliveryMode =
    body.deliveryMode === "digest" || body.deliveryMode === "instant" ? body.deliveryMode : undefined;
  const digestHour =
    typeof body.digestHour === "number" && Number.isFinite(body.digestHour)
      ? Math.max(0, Math.min(23, Math.floor(body.digestHour)))
      : undefined;

  const pref = await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      disabledTypes: disabledTypes ?? [],
      deliveryMode: deliveryMode ?? "instant",
      digestHour: digestHour ?? 8,
    },
    update: {
      ...(disabledTypes !== undefined ? { disabledTypes } : {}),
      ...(deliveryMode !== undefined ? { deliveryMode } : {}),
      ...(digestHour !== undefined ? { digestHour } : {}),
    },
  });
  return NextResponse.json({
    disabledTypes: pref.disabledTypes,
    deliveryMode: pref.deliveryMode,
    digestHour: pref.digestHour,
    knownTypes: KNOWN_TYPES,
  });
}
