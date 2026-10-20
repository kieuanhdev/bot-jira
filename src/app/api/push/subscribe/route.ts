import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api/guards";
import { readJsonBody } from "@/lib/api/json-body";
import { PushSubscribeBodySchema, PushSubscriptionSchema } from "@/lib/api/schemas";

export async function POST(req: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const session = guard.session;

  const bodyResult = await readJsonBody(req, PushSubscribeBodySchema, { maxBytes: 4 * 1024 });
  if (!bodyResult.ok) return bodyResult.response;

  const sub = bodyResult.data;
  if (sub.unsubscribe) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { pushSubscription: Prisma.DbNull },
    });
    return NextResponse.json({ ok: true });
  }

  if (!PushSubscriptionSchema.safeParse(sub.subscription).success) {
    return NextResponse.json({ error: "subscription required" }, { status: 400 });
  }

  // Store the raw browser object (e.g. expirationTime) rather than the parsed subset.
  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: sub.subscription as object },
  });
  return NextResponse.json({ ok: true });
}

