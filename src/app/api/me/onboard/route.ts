import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Mark the current user as having completed first-run onboarding. */
export async function POST() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const exists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboarded: true },
  });
  return NextResponse.json({ ok: true });
}
