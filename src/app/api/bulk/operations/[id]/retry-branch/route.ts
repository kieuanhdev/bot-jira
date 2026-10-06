import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { probeJiraAuth } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

/**
 * BC-SMART-108 — Retry an entire branch rooted at a failed item.
 * Resets the failed parent to `pending` and all its `blocked_by_parent`
 * descendants back to `waiting_for_parent`, then re-enqueues the operation.
 * The dependency-aware worker will create the parent first, then unlock children.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const op = await prisma.bulkOperation.findUnique({
    where: { id },
    select: { id: true, requestedBy: true, state: true, type: true },
  });
  if (!op || op.requestedBy !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!["completed", "partially_failed", "failed"].includes(op.state)) {
    return NextResponse.json({ error: "operation is not in a retryable state" }, { status: 409 });
  }
  if (op.type !== "create-issues") {
    return NextResponse.json({ error: "retry-branch is only available for create-issues operations" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const jiraAuth = userJiraAuth(user);
  if (!jiraAuth) {
    return jiraCredentialsRequired();
  }
  if (!(await probeJiraAuth(jiraAuth))) {
    return NextResponse.json(
      { error: "Token Jira của bạn không còn hợp lệ. Hãy cập nhật trong Settings." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { clientRef?: string };
  if (!body.clientRef || typeof body.clientRef !== "string") {
    return NextResponse.json({ error: "clientRef is required" }, { status: 400 });
  }

  const allItems = await prisma.bulkCreateItem.findMany({
    where: { operationId: id },
    select: { id: true, clientRef: true, status: true, parentClientRef: true },
  });

  const target = allItems.find((i) => i.clientRef === body.clientRef);
  if (!target) {
    return NextResponse.json({ error: `No item found with clientRef "${body.clientRef}"` }, { status: 404 });
  }
  if (target.status !== "failed") {
    return NextResponse.json({ error: `Item "${body.clientRef}" is not in a failed state (current: ${target.status})` }, { status: 409 });
  }

  // BFS: find all descendants of the target item
  const childrenMap = new Map<string, string[]>();
  for (const item of allItems) {
    if (item.parentClientRef) {
      const siblings = childrenMap.get(item.parentClientRef) ?? [];
      siblings.push(item.clientRef);
      childrenMap.set(item.parentClientRef, siblings);
    }
  }

  const descendants: string[] = [];
  const visited = new Set<string>([body.clientRef]);
  const queue = [body.clientRef];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenMap.get(current) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        descendants.push(child);
        queue.push(child);
      }
    }
  }

  // Find blocked descendants that should be unblocked
  const blockedDescendantIds = allItems
    .filter((i) => descendants.includes(i.clientRef) && i.status === "blocked_by_parent")
    .map((i) => i.id);

  if (blockedDescendantIds.length === 0) {
    return NextResponse.json({
      error: `No blocked children found for branch "${body.clientRef}". Use the regular retry endpoint instead.`,
      queued: false,
      operationId: id,
    });
  }

  // Reset the failed parent to pending
  await prisma.bulkCreateItem.updateMany({
    where: { id: target.id, operationId: id, status: "failed" },
    data: { status: "pending", error: null, errorCode: null, retryable: true },
  });

  // Reset blocked descendants back to waiting_for_parent
  await prisma.bulkCreateItem.updateMany({
    where: { id: { in: blockedDescendantIds }, operationId: id, status: "blocked_by_parent" },
    data: { status: "waiting_for_parent", error: null, errorCode: null },
  });

  await prisma.bulkOperation.update({
    where: { id },
    data: { state: "queued", completedAt: null, startedAt: new Date() },
  });

  const jobId = await enqueueBulkOperation(id);
  return NextResponse.json({
    queued: Boolean(jobId),
    operationId: id,
    retriedParent: body.clientRef,
    unblockedChildren: blockedDescendantIds.length,
  });
}
