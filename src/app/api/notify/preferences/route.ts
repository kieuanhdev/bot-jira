import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { invalidBodyPaths, readJsonBody } from "@/lib/api/json-body";
import { NotifyPreferencesBodySchema } from "@/lib/api/schemas";
import {
  DEFAULT_DISABLED_NOTIFICATION_TYPES,
  isAllNotificationsRequired,
  isDefaultBroadcastRole,
} from "@/lib/notify/policy";

export const dynamic = "force-dynamic";

export const KNOWN_TYPES = [
  "comment",
  "issue",
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
 * GET  -> the current user's preference for in-app, team broadcasts and Web Push.
 * PATCH -> update disabledTypes / broadcastEnabled / pushEnabled / pushDisabledTypes.
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
      select: { pushSubscription: true, role: true },
    }),
  ]);

  return NextResponse.json({
    disabledTypes: pref?.disabledTypes ?? [...DEFAULT_DISABLED_NOTIFICATION_TYPES],
    broadcastEnabled: pref?.broadcastEnabled ?? false,
    broadcastRequired: isDefaultBroadcastRole(user?.role),
    allNotificationsRequired: isAllNotificationsRequired(user?.role),
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

  const parsedBody = await readJsonBody(req, NotifyPreferencesBodySchema);
  if (!parsedBody.ok) {
    const paths = await invalidBodyPaths(parsedBody.response);
    if (paths.some((p) => p === "disabledTypes" || p.startsWith("disabledTypes."))) {
      return NextResponse.json({ error: "disabledTypes must be an array" }, { status: 400 });
    }
    if (paths.some((p) => p === "pushDisabledTypes" || p.startsWith("pushDisabledTypes."))) {
      return NextResponse.json({ error: "pushDisabledTypes must be an array" }, { status: 400 });
    }
    return parsedBody.response;
  }
  const body = parsedBody.data;

  // Validate disabledTypes if provided
  let disabledTypes: string[] | undefined;
  if (body.disabledTypes !== undefined) {
    const invalid = body.disabledTypes.filter((t) => !isKnownType(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown notification type: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    disabledTypes = [...new Set(body.disabledTypes)];
  }

  const { pushEnabled, broadcastEnabled, deliveryMode } = body;

  // Validate pushDisabledTypes if provided
  let pushDisabledTypes: string[] | undefined;
  if (body.pushDisabledTypes !== undefined) {
    const invalid = body.pushDisabledTypes.filter((t) => !isKnownType(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown push notification type: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    pushDisabledTypes = [...new Set(body.pushDisabledTypes)];
  }

  const digestHour =
    body.digestHour !== undefined
      ? Math.max(0, Math.min(23, Math.floor(body.digestHour)))
      : undefined;

  const pref = await prisma.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      disabledTypes: disabledTypes ?? [...DEFAULT_DISABLED_NOTIFICATION_TYPES],
      broadcastEnabled: broadcastEnabled ?? false,
      pushEnabled: pushEnabled ?? false,
      pushDisabledTypes: pushDisabledTypes ?? [],
      deliveryMode: deliveryMode ?? "instant",
      digestHour: digestHour ?? 8,
    },
    update: {
      ...(disabledTypes !== undefined ? { disabledTypes } : {}),
      ...(broadcastEnabled !== undefined ? { broadcastEnabled } : {}),
      ...(pushEnabled !== undefined ? { pushEnabled } : {}),
      ...(pushDisabledTypes !== undefined ? { pushDisabledTypes } : {}),
      ...(deliveryMode !== undefined ? { deliveryMode } : {}),
      ...(digestHour !== undefined ? { digestHour } : {}),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pushSubscription: true, role: true },
  });

  return NextResponse.json({
    disabledTypes: pref.disabledTypes,
    broadcastEnabled: pref.broadcastEnabled,
    broadcastRequired: isDefaultBroadcastRole(user?.role),
    allNotificationsRequired: isAllNotificationsRequired(user?.role),
    pushEnabled: pref.pushEnabled,
    pushDisabledTypes: pref.pushDisabledTypes,
    deliveryMode: pref.deliveryMode,
    digestHour: pref.digestHour,
    hasSubscription: Boolean(user?.pushSubscription),
    knownTypes: KNOWN_TYPES,
  });
}
