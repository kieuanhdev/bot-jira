import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { getBoardOptions } from "@/lib/jira/board-options";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const project = (url.searchParams.get("project") ?? "").trim().toUpperCase();
  if (!project) {
    return NextResponse.json(
      { error: "Tham số project không được để trống.", code: "invalid_project" },
      { status: 400 }
    );
  }

  const client = jiraWith(auth);

  try {
    const response = await getBoardOptions(client, user.id, project);
    return NextResponse.json(response);
  } catch (err: unknown) {
    if (err instanceof JiraRequestError) {
      if (err.status === 401 || err.status === 403) {
        return NextResponse.json(
          { error: "Không có quyền truy cập Jira board cho dự án này.", code: "board_forbidden" },
          { status: 403 }
        );
      }
      if (err.status === 404) {
        return NextResponse.json(
          { error: "Dự án không tồn tại trên Jira.", code: "invalid_project" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Không thể kết nối với Jira Agile API.", code: "jira_unavailable" },
      { status: 502 }
    );
  }
}
