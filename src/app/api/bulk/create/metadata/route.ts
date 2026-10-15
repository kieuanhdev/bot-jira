import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { fetchBulkCreateMetadata } from "@/lib/bulk/create-ops";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { logger } from "@/lib/logger";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const project = url.searchParams.get("project")?.trim().toUpperCase();
  if (!project) {
    return NextResponse.json({ error: "Missing project query parameter" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraUsername: true,
      boardProjects: true,
    },
  });

  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    return jiraCredentialsRequired();
  }

  const jira = jiraWith(auth);
  try {
    const meta = await fetchBulkCreateMetadata(jira, project, auth);
    return NextResponse.json(meta);
  } catch (err) {
    if (err instanceof JiraRequestError && err.status !== null && err.status < 500) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const status = err instanceof JiraRequestError && err.status !== null ? err.status : 500;
    logger.error({ message: "Failed to fetch project metadata from Jira", project, error: (err as Error).message });
    return NextResponse.json({ error: "Không thể tải thông tin cấu hình dự án từ Jira" }, { status });
  }
}
