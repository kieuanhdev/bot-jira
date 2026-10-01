import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { validateBoardForProject } from "@/lib/jira/board-membership";
import type { UserBoardPreferenceResponse } from "@/lib/jira/types";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();

  const prefs = (await prisma.userBoardPreference?.findMany({
    where: {
      userId: session.user.id,
      ...(project ? { projectKey: project } : {}),
    },
    select: {
      projectKey: true,
      boardId: true,
      updatedAt: true,
    },
  })) ?? [];

  return NextResponse.json({ items: prefs });
}

export async function PUT(req: Request) {
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
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Payload JSON không hợp lệ.", code: "invalid_project" },
      { status: 400 }
    );
  }

  const { projectKey, boardId } = (body as { projectKey?: string; boardId?: number }) ?? {};
  const cleanKey = (projectKey ?? "").trim().toUpperCase();
  const parsedBoardId = Number(boardId);

  if (!cleanKey || !/^[A-Z][A-Z0-9_]{1,19}$/.test(cleanKey)) {
    return NextResponse.json(
      { error: "Project key không hợp lệ.", code: "invalid_project" },
      { status: 400 }
    );
  }

  if (!Number.isInteger(parsedBoardId) || parsedBoardId <= 0) {
    return NextResponse.json(
      { error: "Board ID phải là số nguyên dương.", code: "invalid_project" },
      { status: 400 }
    );
  }

  const client = jiraWith(auth);

  try {
    // Verify board existence, user permission, and project association with Jira
    const verifiedBoard = await validateBoardForProject(client, parsedBoardId, cleanKey);

    await prisma.userBoardPreference.upsert({
      where: {
        userId_projectKey: {
          userId: user.id,
          projectKey: cleanKey,
        },
      },
      create: {
        userId: user.id,
        projectKey: cleanKey,
        boardId: parsedBoardId,
      },
      update: {
        boardId: parsedBoardId,
      },
    });

    // Invalidate options cache
    const { clearBoardOptionsCache } = await import("@/lib/jira/board-options");
    clearBoardOptionsCache(user.id, cleanKey);

    const { getStoredBoardMembership } = await import("@/lib/jira/board-membership-store");
    const existingMembership = await getStoredBoardMembership(user.id, cleanKey, parsedBoardId);

    let membershipInfo: {
      state: "fresh" | "preparing" | "stale" | "queue_failed";
      jobId: string | null;
    };

    if (existingMembership.state === "fresh") {
      membershipInfo = {
        state: "fresh",
        jobId: null,
      };
    } else {
      const priority = existingMembership.state === "stale" ? "normal" : "high";
      const expectedState = existingMembership.state === "stale" ? "stale" : "preparing";

      try {
        const { enqueueBoardMembershipRefresh } = await import("@/lib/queue/boss");
        const jobId = await enqueueBoardMembershipRefresh({
          userId: user.id,
          projectKey: cleanKey,
          boardId: parsedBoardId,
          priority,
          reason: "preference_saved",
        });

        membershipInfo = {
          state: expectedState,
          jobId,
        };
      } catch {
        membershipInfo = {
          state: "queue_failed",
          jobId: null,
        };
      }
    }

    const response: UserBoardPreferenceResponse = {
      projectKey: cleanKey,
      board: {
        id: verifiedBoard.id,
        name: verifiedBoard.name,
        type: verifiedBoard.type,
      },
      preferenceSaved: true,
      membership: membershipInfo,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    if (err instanceof JiraRequestError) {
      if (err.status === 404) {
        return NextResponse.json(
          { error: `Board ${parsedBoardId} không tồn tại trên Jira.`, code: "board_not_found" },
          { status: 404 }
        );
      }
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json(
          { error: `Không có quyền truy cập board ${parsedBoardId}.`, code: "board_forbidden" },
          { status: 403 }
        );
      }
      if (err.status === 409) {
        return NextResponse.json(
          { error: `Board ${parsedBoardId} không thuộc dự án ${cleanKey}.`, code: "board_project_mismatch" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Không thể kết nối với Jira Agile API.", code: "jira_unavailable" },
      { status: 502 }
    );
  }
}
