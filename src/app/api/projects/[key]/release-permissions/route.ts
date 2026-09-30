import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith, canCreateProjectVersion, JiraRequestError } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", code: "unauthorized" },
      { status: 401 }
    );
  }

  const { key: rawKey } = await ctx.params;
  const projectKey = rawKey?.trim();
  if (!projectKey || projectKey === "all") {
    return NextResponse.json(
      { error: "invalid project key", code: "invalid_project_key" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      {
        error: "Bạn cần cấu hình token Jira cá nhân trong Settings.",
        code: "jira_credentials_required",
      },
      { status: 428 }
    );
  }

  const client = jiraWith(auth);

  try {
    const permissions = await client.getMyPermissions(projectKey);
    const canCreate = canCreateProjectVersion(permissions);

    if (!canCreate) {
      return NextResponse.json({
        projectKey,
        hasToken: true,
        canCreateVersion: false,
        reason: "jira_permission_required",
      });
    }

    return NextResponse.json({
      projectKey,
      hasToken: true,
      canCreateVersion: true,
    });
  } catch (error) {
    if (error instanceof JiraRequestError) {
      if (error.status === 401 || error.status === 403) {
        return NextResponse.json(
          {
            error: "Jira token không hợp lệ hoặc đã hết hạn.",
            code: "jira_auth_failed",
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        {
          error: error.message || "Jira không khả dụng.",
          code: "jira_unavailable",
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        error: (error as Error).message || "Jira không khả dụng.",
        code: "jira_unavailable",
      },
      { status: 502 }
    );
  }
}
