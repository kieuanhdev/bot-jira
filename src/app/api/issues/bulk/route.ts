import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userBitbucketCreds, userJiraAuth } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import {
  previewBulk,
  confirmBulk,
  validateBulkRequest,
} from "@/lib/bulk/ops";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { probeJiraAuth } from "@/lib/jira/client";

/**
 * M4-02 — Preview + confirm a bulk operation.
 *
 * The request body always includes `action` + `keys`. If `confirm: true` and
 * `operationId` match a `preview` operation the caller created earlier, the
 * operation is confirmed and enqueued for background execution. Otherwise a
 * fresh preview is computed (no mutation) and returned.
 *
 * Confirming requires the exact operation id from a prior preview, which is the
 * "confirm by operation id" guard: a client cannot mutate without first
 * previewing and then explicitly confirming that operation.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rawBody = (await req.json().catch(() => ({}))) as {
    keys?: unknown;
    action?: unknown;
    confirm?: boolean;
    operationId?: string;
  };

  if (rawBody.confirm && rawBody.operationId) {
    // Confirm path: the immutable preview is already stored; we only re-check
    // ownership/state, credentials, then confirm + enqueue.
    const existing = await prisma.bulkOperation.findUnique({
      where: { id: rawBody.operationId },
      select: { id: true, requestedBy: true, state: true, type: true },
    });
    if (!existing || existing.requestedBy !== session.user.id) {
      return NextResponse.json({ error: "operation not found" }, { status: 404 });
    }
    if (existing.state !== "preview") {
      return NextResponse.json({ error: "operation already confirmed" }, { status: 409 });
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
    // Fail fast if the actor's Jira credential expired before the worker runs.
    if (!(await probeJiraAuth(jiraAuth))) {
      return NextResponse.json(
        { error: "Your Jira credentials are no longer valid. Update them in Settings and retry." },
        { status: 400 }
      );
    }
    if (existing.type === "create-branches" && !userBitbucketCreds(user)) {
      return NextResponse.json(
        { error: "Bạn cần cấu hình token Bitbucket cá nhân trong Settings.", code: "bitbucket_credentials_required" },
        { status: 428 }
      );
    }
    try {
      const res = await confirmBulk(rawBody.operationId, session.user.id);
      const jobId = await enqueueBulkOperation(rawBody.operationId);
      return NextResponse.json({
        operationId: res.operationId,
        total: res.total,
        actionable: res.actionable,
        skipped: res.skipped,
        queued: Boolean(jobId),
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  // Preview path — BULK-004: validate the action and keys on the server before
  // doing any work, so a malformed/oversized request is rejected with 400
  // immediately instead of failing deep inside the worker.
  const validated = validateBulkRequest(rawBody);
  if (!validated.ok) {
    return NextResponse.json({ error: "invalid request", fields: validated.errors }, { status: 400 });
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
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  const bitbucketCreds = userBitbucketCreds(user);
  if (validated.action.kind === "create-branches" && !bitbucketCreds) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Bitbucket cá nhân trong Settings.", code: "bitbucket_credentials_required" },
      { status: 428 }
    );
  }
  const jira = jiraWith(auth);
  try {
    const preview = await previewBulk(
      validated.action,
      validated.keys,
      session.user.id,
      jira,
      bitbucketCreds
    );
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
