import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * M4 — List the current user's bulk operations (most recent first) with
 * progress. Used by the bulk page to show in-flight and past operations.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));

  const items = await prisma.bulkOperation.findMany({
    where: { requestedBy: session.user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      state: true,
      total: true,
      succeeded: true,
      failed: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ items });
}
