import type { SentryIssueImported } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, probeJiraAuth, JiraRequestError } from "@/lib/jira/client";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { previewBulkCreate, confirmBulkCreate } from "@/lib/bulk/create-ops";
import type { BulkCreateRowInput } from "@/lib/bulk/create-types";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import {
  buildSentryBulkRequest,
  confirmSentryCreate,
  hasInflightSentryOp,
  MSG_INFLIGHT,
  MSG_NOT_OPEN,
  OPEN_SENTRY_STATES,
} from "@/lib/sentry/create-from-form";
import { assertSentryRowAccess, resolveRowTargetProject, sentryScopeFor } from "@/lib/sentry/scope";

/**
 * File one reviewed Sentry issue through the bulk create pipeline with the
 * user's own Jira token. Same preview/confirm contract and response shapes as
 * `/api/bulk/create`: preview body `{row}`, confirm body `{confirm:true, operationId}`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const scope = await sentryScopeFor(session);

  let sentryRow: SentryIssueImported;
  try {
    sentryRow = await assertSentryRowAccess(id, scope);
  } catch {
    return NextResponse.json({ error: "Không tìm thấy lỗi Sentry" }, { status: 404 });
  }

  const rawBody = (await req.json().catch(() => ({}))) as {
    row?: unknown;
    confirm?: boolean;
    operationId?: string;
  };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
    },
  });

  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    return jiraCredentialsRequired();
  }

  // Confirm flow
  if (rawBody.confirm && rawBody.operationId) {
    const operationId = rawBody.operationId;
    const isValid = await probeJiraAuth(auth);
    if (!isValid) {
      return NextResponse.json(
        { error: "Token Jira của bạn không còn hợp lệ. Hãy cập nhật trong Settings." },
        { status: 400 }
      );
    }

    try {
      const guarded = await confirmSentryCreate({
        sentryImportId: id,
        operationId,
        reviewer: session.user.email ?? session.user.id,
        confirm: (opId) => confirmBulkCreate(opId, session.user.id),
      });
      if (!guarded.ok) {
        return NextResponse.json({ error: guarded.error }, { status: guarded.status });
      }
      const res = guarded.result;
      const jobId = await enqueueBulkOperation(operationId);

      await audit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        action: "sentry.create_form",
        target: id,
        after: { operationId, total: res.total, actionable: res.actionable, blocked: res.blocked },
        source: "web",
      });

      return NextResponse.json({
        operationId: res.operationId,
        total: res.total,
        actionable: res.actionable,
        blocked: res.blocked,
        queued: Boolean(jobId),
      });
    } catch (err) {
      const msg = (err as Error).message;
      const isKnown =
        msg.includes("không tìm thấy") ||
        msg.includes("đã được xác nhận") ||
        msg.includes("Thao tác không phải là");
      const status = msg.includes("không tìm thấy") ? 404 : msg.includes("đã được xác nhận") ? 409 : 400;
      if (!isKnown) {
        logger.error({ message: "Failed to confirm sentry create", operationId, sentryImportId: id, error: msg });
      }
      return NextResponse.json({ error: isKnown ? msg : "Không thể xác nhận thao tác tạo task" }, { status });
    }
  }

  // Preview flow
  const row = rawBody.row as BulkCreateRowInput | undefined;
  if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.summary !== "string") {
    return NextResponse.json({ error: "row required" }, { status: 400 });
  }

  if (!OPEN_SENTRY_STATES.includes(sentryRow.state)) {
    return NextResponse.json({ error: MSG_NOT_OPEN }, { status: 409 });
  }
  if (await hasInflightSentryOp(id)) {
    return NextResponse.json({ error: MSG_INFLIGHT }, { status: 409 });
  }

  const targetProject = resolveRowTargetProject(sentryRow);
  const request = buildSentryBulkRequest(row, {
    id: sentryRow.id,
    sentryIssueId: sentryRow.sentryIssueId,
    targetProject,
  });
  if ("error" in request) {
    return NextResponse.json({ error: request.error }, { status: 400 });
  }

  const jira = jiraWith(auth);
  try {
    const preview = await previewBulkCreate(session.user.id, jira, auth, request);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof JiraRequestError && err.status !== null && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = err instanceof JiraRequestError && err.status !== null ? err.status : 400;
    logger.error({ message: "Sentry create preview failed", sentryImportId: id, error: (err as Error).message });
    return NextResponse.json({ error: "Không thể tạo bản xem trước cho task" }, { status });
  }
}
