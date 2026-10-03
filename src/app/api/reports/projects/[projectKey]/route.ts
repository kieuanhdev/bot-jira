import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolveUserProjectScope, assertProjectAccess } from "@/lib/reports/scope";
import { getProjectReportDetail } from "@/lib/reports/project-query";
import type { ReportUnit } from "@/lib/reports/types";

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
  const unit = (url.searchParams.get("unit") as ReportUnit | null) || undefined;
  const period = url.searchParams.get("period") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const timezone = url.searchParams.get("timezone") || undefined;
  const comparePrevious = url.searchParams.get("comparePrevious") !== "false";
  const includeSubtasks = url.searchParams.get("includeSubtasks") !== "false";

  try {
    const report = await getProjectReportDetail({
      projectKey,
      versionId,
      unit,
      period,
      from,
      to,
      timezone,
      comparePrevious,
      includeSubtasks,
    });

    if (!report) {
      return NextResponse.json(
        { error: "not_found", message: `Không tìm thấy thông tin dự án '${projectKey}'.` },
        { status: 404 }
      );
    }

    return NextResponse.json(report);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to generate project report",
      },
      { status: 500 }
    );
  }
}
