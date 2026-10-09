import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { audit } from "@/lib/audit";
import {
  validateCreateWorklogInput,
  computeWorklogRequestHash,
  formatJiraStartedAt,
  parseJiraDuration,
  type CreateWorklogResult,
} from "@/lib/worklogs/schema";

export async function handleCreateWorklogRequest(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  // 1. Authenticate user session
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { key: rawKey } = await ctx.params;
  const jiraKey = rawKey?.trim().toUpperCase();
  if (!jiraKey) {
    return NextResponse.json({ error: "Jira key is required" }, { status: 400 });
  }

  // 2. Fetch personal Jira credentials (worklog must be performed under the actor's identity)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      {
        error: "Bạn cần cấu hình token Jira cá nhân trong Settings để ghi worklog.",
        code: "JIRA_CREDENTIALS_REQUIRED",
      },
      { status: 428 }
    );
  }

  // 3. Parse and validate JSON input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu JSON không hợp lệ.", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const validation = validateCreateWorklogInput(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error, code: validation.code },
      { status: 400 }
    );
  }
  const input = validation.data;
  const requestHash = computeWorklogRequestHash(input);

  // 4. Idempotency ledger check
  const existingIdempotency = await prisma.worklogIdempotency.findUnique({
    where: { key: input.idempotencyKey },
  });

  if (existingIdempotency) {
    if (existingIdempotency.requestHash !== requestHash) {
      return NextResponse.json(
        {
          error: "Idempotency key này đã được dùng cho một yêu cầu ghi worklog khác.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 }
      );
    }

    if (existingIdempotency.status === "succeeded") {
      const cachedResponse = (existingIdempotency.response as Record<string, unknown>) ?? {
        jiraKey,
        jiraWorklogId: existingIdempotency.jiraWorklogId,
        timeSpentSeconds: existingIdempotency.timeSpentSeconds,
        cacheSynced: true,
      };
      return NextResponse.json(
        {
          ...cachedResponse,
          duplicate: true,
        },
        { status: 200 }
      );
    }

    if (existingIdempotency.status === "in_progress") {
      return NextResponse.json(
        {
          error: "Yêu cầu ghi worklog đang được xử lý, vui lòng không gửi lại nhiều lần.",
          code: "IN_PROGRESS",
        },
        { status: 409 }
      );
    }

    if (existingIdempotency.status === "outcome_unknown") {
      return NextResponse.json(
        {
          error:
            "Yêu cầu trước đó gặp timeout trên Jira chưa rõ kết quả. Để tránh cộng dồn hai lần, vui lòng đối soát lại task trước khi thử lại.",
          code: "OUTCOME_UNKNOWN",
        },
        { status: 409 }
      );
    }
  }

  // Claim idempotency slot
  await prisma.worklogIdempotency.upsert({
    where: { key: input.idempotencyKey },
    create: {
      key: input.idempotencyKey,
      userId: session.user.id,
      jiraKey,
      requestHash,
      status: "in_progress",
    },
    update: {
      userId: session.user.id,
      jiraKey,
      requestHash,
      status: "in_progress",
      error: null,
    },
  });

  // 5. Call Jira addWorklog
  const client = jiraWith(auth);
  const formattedStarted = formatJiraStartedAt(input.startedAt);
  let jiraWorklogId: string | null = null;
  let timeSpentSeconds: number | null = null;

  try {
    const worklogRes = await client.addWorklog(
      jiraKey,
      {
        timeSpent: input.timeSpent,
        started: formattedStarted,
        comment: input.comment,
      },
      "leave"
    );

    jiraWorklogId = worklogRes?.id ? String(worklogRes.id) : null;
    timeSpentSeconds =
      typeof worklogRes?.timeSpentSeconds === "number"
        ? worklogRes.timeSpentSeconds
        : parseJiraDuration(input.timeSpent);
  } catch (error) {
    const isTimeout =
      error instanceof JiraRequestError &&
      (error.status === null || error.status === 408 || error.status === 504);

    if (isTimeout) {
      await prisma.worklogIdempotency.update({
        where: { key: input.idempotencyKey },
        data: {
          status: "outcome_unknown",
          error: "Timeout waiting for Jira response on addWorklog",
        },
      });

      return NextResponse.json(
        {
          error:
            "Không nhận được phản hồi kịp thời từ Jira. Hệ thống tạm dừng để tránh ghi thời gian trùng lặp. Vui lòng kiểm tra lại Jira trước khi thử lại.",
          code: "OUTCOME_UNKNOWN",
        },
        { status: 504 }
      );
    }

    const status = error instanceof JiraRequestError ? error.status : null;
    const isForbidden = status === 401 || status === 403;
    const code = isForbidden ? "WORKLOG_FORBIDDEN" : "JIRA_UNAVAILABLE";
    const errorMessage = isForbidden
      ? "Bạn không có quyền ghi thời gian (Work on Issues) trên task này hoặc thông tin Jira không hợp lệ."
      : (error as Error).message;

    await prisma.worklogIdempotency.update({
      where: { key: input.idempotencyKey },
      data: {
        status: "failed",
        error: errorMessage,
      },
    });

    return NextResponse.json(
      { error: errorMessage, code },
      { status: isForbidden ? 403 : 502 }
    );
  }

  // 6. Refresh local issue cache (best-effort, non-fatal)
  let cacheSynced = false;
  try {
    cacheSynced = await refreshJiraIssueCache(client, jiraKey, {
      excludeUserId: session.user.id,
    });
  } catch {
    cacheSynced = false;
  }

  // 7. Audit log (SEC: DO NOT write raw comment!)
  await audit({
    actorId: session.user.id,
    actorEmail: user?.email ?? null,
    action: "issue.worklog_created",
    target: jiraKey,
    after: {
      timeSpent: input.timeSpent,
      timeSpentSeconds,
      startedAt: input.startedAt,
      jiraWorklogId,
      cacheSynced,
      commentLength: input.comment ? input.comment.length : 0,
    },
    source: "api",
    correlationId: input.idempotencyKey,
  });

  const result: CreateWorklogResult = {
    jiraKey,
    jiraWorklogId,
    timeSpentSeconds,
    cacheSynced,
    duplicate: false,
  };

  // 8. Finalize idempotency ledger to succeeded
  await prisma.worklogIdempotency.update({
    where: { key: input.idempotencyKey },
    data: {
      status: "succeeded",
      jiraWorklogId,
      timeSpentSeconds,
      response: result,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
