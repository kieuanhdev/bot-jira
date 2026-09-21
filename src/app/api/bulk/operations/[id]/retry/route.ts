import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enqueueBulkOperation } from "@/lib/queue/boss";

/**
 * M4 — Retry a finished bulk operation. Resets the counters and any
 * non-succeeded items back to `pending`, then re-enqueues the operation.
 * Succeeded items are never re-run (the worker skips them), so this is safe to
 * call again and only re-drives the failed/skipped items.
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
  if (!["completed", "partially_failed", "failed"].includes(op.state)) {
    return NextResponse.json({ error: "operation is not in a retryable state" }, { status: 409 });
  }

  // Reset non-succeeded items to pending and clear their error/retry flags.
  await prisma.bulkOperationItem.updateMany({
    where: { operationId: id, status: { not: "succeeded" } },
    data: { status: "pending", error: null, retryable: true },
  });
  await prisma.bulkOperation.update({
    where: { id },
    data: { state: "queued", succeeded: 0, failed: 0, completedAt: null, startedAt: new Date() },
  });

  const jobId = await enqueueBulkOperation(id);
  return NextResponse.json({ queued: Boolean(jobId), operationId: id });
}
