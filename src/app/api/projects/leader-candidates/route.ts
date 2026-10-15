import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api/guards";
import { canUserManageAnyProjectLeaders } from "@/lib/projects/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const canManage = await canUserManageAnyProjectLeaders(auth.session.user);
  if (!canManage) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });

  return NextResponse.json({ users });
}
