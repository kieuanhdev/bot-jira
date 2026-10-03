import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { resolveUserProjectScope, assertProjectAccess } from "@/lib/reports/scope";
import { getProjectHistory } from "@/lib/reports/history-query";
import { resolveReportPeriod } from "@/lib/reports/period";
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
  const periodParam = url.searchParams.get("period");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const timezoneParam = url.searchParams.get("timezone");
  const versionId = url.searchParams.get("versionId") || undefined;
  const unit = (url.searchParams.get("unit") as ReportUnit | null) || undefined;

  const { period } = resolveReportPeriod({
    period: periodParam,
    from: fromParam,
    to: toParam,
    timezone: timezoneParam,
  });

  try {
    const result = await getProjectHistory({
      projectKey,
      period,
      versionId,
      unit,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to query history report",
      },
      { status: 500 }
    );
  }
}
