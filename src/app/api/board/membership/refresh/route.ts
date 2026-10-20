import { NextResponse } from "next/server";
import { invalidBodyPaths, readJsonBody } from "@/lib/api/json-body";
import { BoardMembershipRefreshBodySchema } from "@/lib/api/schemas";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { enqueueBoardMembershipRefresh } from "@/lib/queue/boss";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }

  const auth = userJiraAuth(user);
  if (!auth) {
    return jiraCredentialsRequired();
  }

  const parsedBody = await readJsonBody(req, BoardMembershipRefreshBodySchema);
  if (!parsedBody.ok) {
    const paths = await invalidBodyPaths(parsedBody.response);
    if (paths.length === 1 && paths[0] === "boardId") {
      return NextResponse.json(
        { error: "Board ID phải là số nguyên dương.", code: "invalid_board" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { projectKey, boardId, reason, force } = parsedBody.data;

  const cleanKey = (projectKey ?? "").trim().toUpperCase();
  const parsedBoardId = Number(boardId);

  if (!cleanKey || !/^[A-Z][A-Z0-9_]{1,19}$/.test(cleanKey)) {
    return NextResponse.json({ error: "Project key không hợp lệ.", code: "invalid_project" }, { status: 400 });
  }
  if (!Number.isInteger(parsedBoardId) || parsedBoardId <= 0) {
    return NextResponse.json({ error: "Board ID phải là số nguyên dương.", code: "invalid_board" }, { status: 400 });
  }

  try {
    const jobId = await enqueueBoardMembershipRefresh({
      userId: user.id,
      projectKey: cleanKey,
      boardId: parsedBoardId,
      priority: "high",
      force: Boolean(force),
      reason: reason || "manual_retry",
    });

    return NextResponse.json(
      {
        ok: true,
        projectKey: cleanKey,
        boardId: parsedBoardId,
        state: "preparing",
        jobId,
      },
      { status: 202 }
    );
  } catch {
    return NextResponse.json(
      {
        error: "Không thể đưa yêu cầu làm mới vào hàng đợi.",
        code: "queue_failed",
      },
      { status: 500 }
    );
  }
}
