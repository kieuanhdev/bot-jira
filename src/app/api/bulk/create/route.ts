import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, probeJiraAuth, JiraRequestError } from "@/lib/jira/client";
import { enqueueBulkOperation } from "@/lib/queue/boss";
import { previewBulkCreate, confirmBulkCreate } from "@/lib/bulk/create-ops";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawBody = (await req.json().catch(() => ({}))) as {
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
    return NextResponse.json(
      {
        error: "Bạn cần cấu hình token Jira cá nhân trong Settings.",
        code: "jira_credentials_required",
      },
      { status: 428 }
    );
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
      const status = msg.includes("không tìm thấy") ? 404 : msg.includes("đã được xác nhận") ? 409 : 400;
      return NextResponse.json({ error: msg }, { status });
    }
  }

  // Preview flow
  const jira = jiraWith(auth);
  try {
    const preview = await previewBulkCreate(session.user.id, jira, auth, rawBody);
    return NextResponse.json(preview);
  } catch (err) {
    if (err instanceof JiraRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
