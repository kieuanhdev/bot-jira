import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { fetchBulkCreateMetadata } from "@/lib/bulk/create-ops";
import { generateBulkCreateExcelTemplate } from "@/lib/bulk/excel-template";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

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

    if (!meta.canCreate) {
      return NextResponse.json(
        {
          error:
            meta.permissionReason ||
            `Tài khoản của bạn không có quyền tạo task trong dự án ${project}.`,
          code: "forbidden",
        },
        { status: 403 }
      );
    }

    // Fetch assignable users for dropdown (limit 50)
    let assignees: Array<{ username: string; displayName: string }> = [];
    try {
      const rawUsers = await jira.searchAssignableUsers(project, "", 50);
      assignees = rawUsers
        .filter((u) => u.name && u.active !== false)
        .map((u) => ({
          username: u.name ?? "",
          displayName: u.displayName ?? u.name ?? "",
        }));
    } catch {
      // Non-fatal, workbook will still generate without assignees dropdown
    }

    const buffer = await generateBulkCreateExcelTemplate({
      metadata: meta,
      assignees,
    });

    const now = new Date();
    const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const filename = `bulk-create-${project}-${yyyymmdd}.xlsx`;

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    if (err instanceof JiraRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
