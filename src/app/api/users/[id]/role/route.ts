import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { ROLES } from "@/lib/permissions";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const { role } = (await req.json()) as { role: string };
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role: role as "member" | "release_manager" | "admin" },
    select: { id: true, role: true },
  });
  return NextResponse.json({ user });
}
