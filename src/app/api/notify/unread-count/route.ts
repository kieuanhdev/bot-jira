import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const unread = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });
  return NextResponse.json({ unread });
}
