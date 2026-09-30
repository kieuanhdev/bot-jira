import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { fetchBulkCreateMetadata } from "@/lib/bulk/create-ops";

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
    return NextResponse.json(
      {
        error: "Bạn cần cấu hình token Jira cá nhân trong Settings.",
        code: "jira_credentials_required",
      },
      { status: 428 }
    );
  }

  const jira = jiraWith(auth);
  try {
    const meta = await fetchBulkCreateMetadata(jira, project, auth);
    return NextResponse.json(meta);
  } catch (err) {
    if (err instanceof JiraRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
