import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * M4 — Fetch a single bulk operation with its per-item audit trail.
 * Only the requesting user (or an admin) may read the operation.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const op = await prisma.bulkOperation.findUnique({
    where: { id },
    include: {
      items: { orderBy: { jiraKey: "asc" } },
    },
  });

  if (!op) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (op.requestedBy !== session.user.id && session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ operation: op });
}
