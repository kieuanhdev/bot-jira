import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolveUserProjectScope, assertProjectAccess } from "@/lib/reports/scope";
import { getProjectRiskTasks } from "@/lib/reports/project-query";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectKey: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!can(session, "report.view")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { projectKey } = await params;
  if (!projectKey) {
    return NextResponse.json({ error: "project_key_required" }, { status: 400 });
  }

  const userScope = await resolveUserProjectScope(session.user.id, session.user.role);
  const isAllowed = await assertProjectAccess(projectKey, userScope);
  if (!isAllowed) {
    return NextResponse.json(
      { error: "forbidden", message: `Bạn không có quyền truy cập dự án '${projectKey}'.` },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const versionId = url.searchParams.get("versionId") || undefined;
  const risk = url.searchParams.get("risk") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const assignee = url.searchParams.get("assignee") || undefined;
  const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : 50;
  const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : 0;

  try {
    const result = await getProjectRiskTasks({
      projectKey,
      versionId,
      risk,
      status,
      assignee,
      limit,
      offset,
    });

    if (!result) {
      return NextResponse.json(
        { error: "not_found", message: `Không tìm thấy thông tin dự án '${projectKey}'.` },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to fetch project risk tasks",
      },
      { status: 500 }
    );
  }
}
