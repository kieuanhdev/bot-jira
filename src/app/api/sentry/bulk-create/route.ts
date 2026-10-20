import type { SentryIssueImported } from "@prisma/client";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { SentryBulkCreateBodySchema } from "@/lib/api/schemas";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, probeJiraAuth, JiraRequestError } from "@/lib/jira/client";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { previewBulkCreate, confirmBulkCreate } from "@/lib/bulk/create-ops";
import type { BulkCreateRequest, BulkCreateRowInput } from "@/lib/bulk/create-types";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { buildSentryTaskDraft } from "@/lib/sentry/task-draft";
import { sentryLabel } from "@/lib/sentry/idempotency";
import {
  confirmSentryCreate,
  hasInflightSentryOp,
  MSG_INFLIGHT,
  MSG_NOT_OPEN,
  OPEN_SENTRY_STATES,
  sentryImportIdsOfPayload,
} from "@/lib/sentry/create-from-form";
import { assertSentryRowAccess, resolveRowTargetProject, sentryScopeFor } from "@/lib/sentry/scope";

const MAX_BULK_SENTRY_ITEMS = 50;

/**
 * Bulk create Jira tasks from multiple reviewed Sentry issues using the user's
 * Jira token. Preview body `{ ids: string[] }`, confirm body `{ confirm: true, operationId: string }`.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsedBody = await readJsonBody(req, SentryBulkCreateBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const rawBody = parsedBody.data;

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

    const op = await prisma.bulkOperation.findUnique({
      where: { id: operationId },
      select: { payload: true },
    });
    if (!op) {
      return NextResponse.json({ error: "Thao tác không tìm thấy" }, { status: 404 });
    }

    const opIds = sentryImportIdsOfPayload(op.payload);
    if (opIds.length === 0) {
      return NextResponse.json({ error: "Thao tác không thuộc về nguồn Sentry" }, { status: 400 });
    }

    const scope = await sentryScopeFor(session);
    try {
      await Promise.all(opIds.map((id) => assertSentryRowAccess(id, scope)));
    } catch {
      return NextResponse.json({ error: "Không tìm thấy lỗi Sentry" }, { status: 404 });
    }

    try {
      const guarded = await confirmSentryCreate({
        sentryImportIds: opIds,
        operationId,
        reviewer: session.user.email ?? session.user.id,
        confirm: (id) => confirmBulkCreate(id, session.user.id),
      });
      if (!guarded.ok) {
        return NextResponse.json({ error: guarded.error }, { status: guarded.status });
      }
      const res = guarded.result;
      const jobId = await enqueueBulkOperation(operationId);

      await audit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        action: "sentry.bulk_create",
        target: opIds.join(",").slice(0, 500),
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
        logger.error({ message: "Failed to confirm sentry bulk create", operationId, sentryImportIds: opIds, error: msg });
      }
      return NextResponse.json({ error: isKnown ? msg : "Không thể xác nhận thao tác tạo task" }, { status });
    }
  }

  // Preview flow
  const rawIds = rawBody.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const ids = [
    ...new Set(
      rawIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
    ),
  ];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  if (ids.length > MAX_BULK_SENTRY_ITEMS) {
    return NextResponse.json(
      { error: `Chỉ có thể tạo tối đa ${MAX_BULK_SENTRY_ITEMS} task mỗi lần` },
      { status: 400 }
    );
  }

  const scope = await sentryScopeFor(session);
  let rows: SentryIssueImported[];
  try {
    rows = await Promise.all(ids.map((id) => assertSentryRowAccess(id, scope)));
  } catch {
    return NextResponse.json({ error: "Không tìm thấy lỗi Sentry" }, { status: 404 });
  }

  for (const row of rows) {
    if (!OPEN_SENTRY_STATES.includes(row.state)) {
      return NextResponse.json({ error: MSG_NOT_OPEN }, { status: 409 });
    }
    if (await hasInflightSentryOp(row.id)) {
      return NextResponse.json({ error: MSG_INFLIGHT }, { status: 409 });
    }
  }

  const targetProjects = [...new Set(rows.map((r) => resolveRowTargetProject(r)))];
  if (targetProjects.includes(null)) {
    return NextResponse.json({ error: "Chưa map project Jira cho Sentry project này" }, { status: 400 });
  }
  if (targetProjects.length !== 1) {
    return NextResponse.json(
      { error: "Chỉ có thể tạo hàng loạt cho các lỗi thuộc cùng một dự án Jira" },
      { status: 400 }
    );
  }
  const projectKey = targetProjects[0]!;

  const items: BulkCreateRowInput[] = rows.map((r) => {
    const draft = buildSentryTaskDraft(r);
    return {
      clientRef: `sentry-${r.id}`,
      summary: r.draftSummary || draft.summary,
      description: r.draftDescription || draft.description,
      issueType: draft.issueType,
      labels: [...new Set(["sentry", sentryLabel({ id: r.sentryIssueId })])],
    };
  });

  const request: BulkCreateRequest = {
    projectKey,
    items,
    source: { type: "sentry", sentryImportIds: rows.map((r) => r.id) },
  };

  const jira = jiraWith(auth);
  try {
    const preview = await previewBulkCreate(session.user.id, jira, auth, request);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof JiraRequestError && err.status !== null && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = err instanceof JiraRequestError && err.status !== null ? err.status : 400;
    logger.error({ message: "Sentry bulk create preview failed", ids, error: (err as Error).message });
    return NextResponse.json({ error: "Không thể tạo bản xem trước cho danh sách task" }, { status });
  }
}
