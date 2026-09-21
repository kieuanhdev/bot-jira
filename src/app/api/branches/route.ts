import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** List tracked branches, highlighting unmerged ones. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const items = await prisma.branchInfo.findMany({
    orderBy: [{ merged: "asc" }, { checkedAt: "desc" }],
  });
  return NextResponse.json({ items });
}
