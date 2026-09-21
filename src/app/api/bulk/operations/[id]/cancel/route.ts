import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { cancelBulk } from "@/lib/bulk/ops";

/**
 * M4 — Cancel a bulk operation. Only a `preview` (not yet confirmed) operation
 * can be cancelled. Confirmed/running operations must finish; use the retry
 * route to re-drive any failed items.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const op = await prisma.bulkOperation.findUnique({
    where: { id },
    select: { id: true, requestedBy: true, state: true },
  });
  if (!op || op.requestedBy !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (op.state !== "preview") {
    return NextResponse.json({ error: "only a preview operation can be cancelled" }, { status: 409 });
  }

  await cancelBulk(id, session.user.id);
  return NextResponse.json({ ok: true });
}
