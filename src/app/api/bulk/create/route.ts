import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, probeJiraAuth, JiraRequestError } from "@/lib/jira/client";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { previewBulkCreate, confirmBulkCreate } from "@/lib/bulk/create-ops";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { logger } from "@/lib/logger";
import { sentryImportIdsOfPayload } from "@/lib/sentry/create-from-form";

// Sentry-sourced ops must go through /api/sentry/bulk-create or /api/sentry/[id]/create, which
// locks the Sentry row(s) (confirmSentryCreate) so the issue is filed only once.
const MSG_SENTRY_SOURCE = "Task từ Sentry phải được tạo qua màn hình duyệt lỗi Sentry";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = (await req.json().catch(() => ({}))) as {
    confirm?: boolean;
    operationId?: string;
    source?: unknown;
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
    const isValid = await probeJiraAuth(auth);
    if (!isValid) {
      return NextResponse.json(
        { error: "Token Jira của bạn không còn hợp lệ. Hãy cập nhật trong Settings." },
        { status: 400 }
      );
    }

    const existing = await prisma.bulkOperation.findUnique({
      where: { id: rawBody.operationId },
      select: { payload: true },
    });
    // A missing op falls through to confirmBulkCreate, which reports "không tìm thấy".
    if (existing && sentryImportIdsOfPayload(existing.payload).length > 0) {
      return NextResponse.json({ error: MSG_SENTRY_SOURCE }, { status: 400 });
    }

    try {
      const res = await confirmBulkCreate(rawBody.operationId, session.user.id);
      const jobId = await enqueueBulkOperation(rawBody.operationId);

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
        logger.error({ message: "Failed to confirm bulk create", operationId: rawBody.operationId, error: msg });
      }
      return NextResponse.json({ error: isKnown ? msg : "Không thể xác nhận thao tác tạo task hàng loạt" }, { status });
    }
  }

  // Preview flow
  const source = rawBody.source as { type?: unknown } | null | undefined;
  if (source && typeof source === "object" && source.type === "sentry") {
    return NextResponse.json({ error: MSG_SENTRY_SOURCE }, { status: 400 });
  }
  const jira = jiraWith(auth);
  try {
    const preview = await previewBulkCreate(session.user.id, jira, auth, rawBody);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof JiraRequestError && err.status !== null && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = err instanceof JiraRequestError && err.status !== null ? err.status : 400;
    logger.error({ message: "Bulk create preview failed", error: (err as Error).message });
    return NextResponse.json({ error: "Không thể tạo bản xem trước cho danh sách task" }, { status });
  }
}
