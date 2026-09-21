import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;
  const userId = session.user.id;

  const existing = await prisma.watch.findUnique({
    where: { userId_jiraKey: { userId, jiraKey: key } },
  });
  if (existing) {
    await prisma.watch.delete({ where: { id: existing.id } });
    return NextResponse.json({ watching: false });
  }
  await prisma.watch.create({ data: { userId, jiraKey: key } });
  return NextResponse.json({ watching: true });
}
