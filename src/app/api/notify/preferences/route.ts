import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const KNOWN_TYPES = [
  "comment",
  "release",
  "transition",
  "stale",
  "ai",
  "sentry",
  "ci",
  "system",
] as const;

export type KnownType = (typeof KNOWN_TYPES)[number];

export function isKnownType(type: string): type is KnownType {
  return (KNOWN_TYPES as readonly string[]).includes(type);
}

/**
 * Notification preferences.
 *
 * GET  -> the current user's preference for in-app and Web Push.
 * PATCH -> update disabledTypes / pushEnabled / pushDisabledTypes.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [pref, user] = await Promise.all([
    prisma.notificationPreference.findUnique({
      where: { userId: session.user.id },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { pushSubscription: true },
    }),
  ]);

  return NextResponse.json({
    disabledTypes: pref?.disabledTypes ?? [],
    pushEnabled: pref?.pushEnabled ?? false,
    pushDisabledTypes: pref?.pushDisabledTypes ?? [],
    deliveryMode: pref?.deliveryMode ?? "instant",
    digestHour: pref?.digestHour ?? 8,
    hasSubscription: Boolean(user?.pushSubscription),
    knownTypes: KNOWN_TYPES,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    disabledTypes?: unknown;
    pushEnabled?: unknown;
    pushDisabledTypes?: unknown;
    deliveryMode?: unknown;
    digestHour?: unknown;
  };

  // Validate disabledTypes if provided
  let disabledTypes: string[] | undefined;
  if (body.disabledTypes !== undefined) {
    if (!Array.isArray(body.disabledTypes)) {
      return NextResponse.json({ error: "disabledTypes must be an array" }, { status: 400 });
    }
    const invalid = body.disabledTypes.filter((t) => typeof t !== "string" || !isKnownType(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown notification type: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    disabledTypes = [...new Set(body.disabledTypes as string[])];
  }

  // Validate pushEnabled if provided
  const pushEnabled = typeof body.pushEnabled === "boolean" ? body.pushEnabled : undefined;

  // Validate pushDisabledTypes if provided
  let pushDisabledTypes: string[] | undefined;
  if (body.pushDisabledTypes !== undefined) {
    if (!Array.isArray(body.pushDisabledTypes)) {
      return NextResponse.json({ error: "pushDisabledTypes must be an array" }, { status: 400 });
    }
    const invalid = body.pushDisabledTypes.filter((t) => typeof t !== "string" || !isKnownType(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown push notification type: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    pushDisabledTypes = [...new Set(body.pushDisabledTypes as string[])];
  }

  const deliveryMode =
    body.deliveryMode === "digest" || body.deliveryMode === "instant"
      ? (body.deliveryMode as string)
      : undefined;
  const digestHour =
    typeof body.digestHour === "number" && Number.isFinite(body.digestHour)
      ? Math.max(0, Math.min(23, Math.floor(body.digestHour)))
      : undefined;

  const pref = await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      disabledTypes: disabledTypes ?? [],
      pushEnabled: pushEnabled ?? false,
      pushDisabledTypes: pushDisabledTypes ?? [],
      deliveryMode: deliveryMode ?? "instant",
      digestHour: digestHour ?? 8,
    },
    update: {
      ...(disabledTypes !== undefined ? { disabledTypes } : {}),
      ...(pushEnabled !== undefined ? { pushEnabled } : {}),
      ...(pushDisabledTypes !== undefined ? { pushDisabledTypes } : {}),
      ...(deliveryMode !== undefined ? { deliveryMode } : {}),
      ...(digestHour !== undefined ? { digestHour } : {}),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pushSubscription: true },
  });

  return NextResponse.json({
    disabledTypes: pref.disabledTypes,
    pushEnabled: pref.pushEnabled,
    pushDisabledTypes: pref.pushDisabledTypes,
    deliveryMode: pref.deliveryMode,
    digestHour: pref.digestHour,
    hasSubscription: Boolean(user?.pushSubscription),
    knownTypes: KNOWN_TYPES,
  });
}
