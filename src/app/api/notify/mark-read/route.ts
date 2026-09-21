import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { ids } = (await req.json()) as { ids: string[] };
  if (!Array.isArray(ids)) return NextResponse.json({ error: "ids required" }, { status: 400 });
  await prisma.notification.updateMany({
    where: { userId: session.user.id, id: { in: ids } },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
