import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { BulkConfirmEnvelopeSchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userBitbucketCreds, userJiraAuth, userJiraUsername } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import {
  previewBulk,
  confirmBulk,
  validateBulkRequest,
  resolveFilterKeys,
  type BulkOperationRequest,
} from "@/lib/bulk/ops";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { probeJiraAuth } from "@/lib/jira/client";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { logger } from "@/lib/logger";

/**
 * M4-02 — Preview + confirm a bulk operation.
 *
 * The request body always includes `action` + `keys` or `action` + `selector`.
 * If `confirm: true` and `operationId` match a `preview` operation the caller created
 * earlier, the operation is confirmed and enqueued for background execution.
 * Otherwise a fresh preview is computed (no mutation) and returned.
 *
 * Confirming requires the exact operation id from a prior preview, which is the
 * "confirm by operation id" guard: a client cannot mutate without first
 * previewing and then explicitly confirming that operation.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsedBody = await readJsonBody(req, BulkConfirmEnvelopeSchema);
  if (!parsedBody.ok) return parsedBody.response;
  // The raw body goes down: the schema only vets the confirm envelope.
  const rawBody = parsedBody.data as BulkOperationRequest;

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
      return jiraCredentialsRequired();
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
      logger.error({ message: "Failed to confirm bulk operation", operationId: rawBody.operationId, error: (e as Error).message });
      const msg = (e as Error).message;
      const isKnown = ["no_keys", "bulk_field_update_requires_single_project", "bitbucket_credentials_required"].includes(msg);
      return NextResponse.json(
        { error: isKnown ? msg : "Không thể xác nhận thao tác hàng loạt" },
        { status: 400 }
      );
    }
  }

  // Preview path
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
    return jiraCredentialsRequired();
  }
  const jiraUsername = userJiraUsername(user);

  let resolvedKeys: string[] | undefined;
  if (
    rawBody.selector &&
    typeof rawBody.selector === "object" &&
    (rawBody.selector as { mode?: string }).mode === "filter"
  ) {
    const s = rawBody.selector as {
      project?: string;
      filters?: {
        q?: string;
        assignees?: string[] | "ALL";
        statuses?: string[];
        labels?: string[];
        priorities?: string[];
        epics?: string[];
      };
    };
    if (!s.project || typeof s.project !== "string" || !s.project.trim()) {
      return NextResponse.json(
        { error: "invalid request", fields: ["selector.project must be a non-empty string"] },
        { status: 400 }
      );
    }
    resolvedKeys = await resolveFilterKeys(
      s.project,
      s.filters || {},
      jiraUsername
    );
  }

  const validated = validateBulkRequest(rawBody, resolvedKeys);
  if (!validated.ok) {
    return NextResponse.json({ error: "invalid request", fields: validated.errors }, { status: 400 });
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
      bitbucketCreds,
      { selector: validated.selector }
    );
    return NextResponse.json(preview);
  } catch (e) {
    logger.error({ message: "Failed to preview bulk operation", error: (e as Error).message });
    const msg = (e as Error).message;
    const isKnown = ["no_keys", "bulk_field_update_requires_single_project", "bitbucket_credentials_required"].includes(msg);
    return NextResponse.json(
      { error: isKnown ? msg : "Không thể xem trước thao tác hàng loạt" },
      { status: 400 }
    );
  }
}
