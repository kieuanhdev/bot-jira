import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sub = (await req.json()) as {
    subscription?: unknown;
    unsubscribe?: boolean;
  };
  if (sub.unsubscribe) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { pushSubscription: Prisma.DbNull },
    });
    return NextResponse.json({ ok: true });
  }
  if (!sub.subscription) return NextResponse.json({ error: "subscription required" }, { status: 400 });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: sub.subscription as object },
  });
  return NextResponse.json({ ok: true });
}
