import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { probeJiraAuth } from "@/lib/jira/client";
import { userBitbucketCreds, userJiraAuth } from "@/lib/user-creds";

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
    select: { id: true, requestedBy: true, state: true, type: true },
  });
  if (!op || op.requestedBy !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!["completed", "partially_failed", "failed"].includes(op.state)) {
    return NextResponse.json({ error: "operation is not in a retryable state" }, { status: 409 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      bitbucketUserEnc: true,
      bitbucketTokenEnc: true,
    },
  });
  const jiraAuth = userJiraAuth(user);
  if (!jiraAuth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  if (!(await probeJiraAuth(jiraAuth))) {
    return NextResponse.json(
      { error: "Token Jira của bạn không còn hợp lệ. Hãy cập nhật trong Settings." },
      { status: 400 }
    );
  }
  if (op.type === "create-branches" && !userBitbucketCreds(user)) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Bitbucket cá nhân trong Settings.", code: "bitbucket_credentials_required" },
      { status: 428 }
    );
  }

  // BULK-003 — only items that failed with a retryable error are re-driven.
  // Succeeded and skipped items are never re-run, and the succeeded counter is
  // preserved so the final tally (aggregated from the DB) stays correct.
  const retried = await prisma.bulkOperationItem.updateMany({
    where: { operationId: id, status: "failed", retryable: true },
    data: { status: "pending", error: null, retryable: true },
  });

  if (retried.count === 0) {
    return NextResponse.json({ error: "no retryable items", queued: false, operationId: id });
  }

  await prisma.bulkOperation.update({
    where: { id },
    data: { state: "queued", completedAt: null, startedAt: new Date() },
  });

  const jobId = await enqueueBulkOperation(id);
  return NextResponse.json({ queued: Boolean(jobId), operationId: id, retried: retried.count });
}
