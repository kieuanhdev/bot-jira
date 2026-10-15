import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { readJsonBody } from "@/lib/api/json-body";

type PushPayload = {
  subscription?: unknown;
  unsubscribe?: boolean;
};

function isPushPayload(v: unknown): v is PushPayload {
  return typeof v === "object" && v !== null;
}

function isValidPushSubscription(sub: unknown): sub is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (typeof sub !== "object" || sub === null) return false;
  const s = sub as { endpoint?: unknown; keys?: unknown };
  if (typeof s.endpoint !== "string" || !s.endpoint.startsWith("https://")) return false;
  if (typeof s.keys !== "object" || s.keys === null) return false;
  const k = s.keys as { p256dh?: unknown; auth?: unknown };
  if (typeof k.p256dh !== "string" || !k.p256dh) return false;
  if (typeof k.auth !== "string" || !k.auth) return false;
  return true;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const bodyResult = await readJsonBody(req, isPushPayload, { maxBytes: 4 * 1024 });
  if (!bodyResult.ok) return bodyResult.response;

  const sub = bodyResult.data;
  if (sub.unsubscribe) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { pushSubscription: Prisma.DbNull },
    });
    return NextResponse.json({ ok: true });
  }

  if (!sub.subscription || !isValidPushSubscription(sub.subscription)) {
    return NextResponse.json({ error: "subscription required" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: sub.subscription as object },
  });
  return NextResponse.json({ ok: true });
}

