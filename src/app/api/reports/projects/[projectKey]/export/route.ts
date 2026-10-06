import { NextResponse } from "next/server";
import { guardProjectReport } from "@/lib/reports/route-guard";
import { getProjectReportDetail, getProjectRiskTasks } from "@/lib/reports/project-query";
import { generateProjectReportCsv } from "@/lib/reports/export";
import type { ReportUnit } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectKey: string }> }
) {
  const guard = await guardProjectReport(params, {
    permission: "report.export",
    forbiddenMessage: (key) => `Bạn không có quyền xuất báo cáo dự án '${key}'.`,
  });
  if (guard.response) return guard.response;
  const { projectKey } = guard;

  const url = new URL(req.url);
  const versionId = url.searchParams.get("versionId") || undefined;
  const unit = (url.searchParams.get("unit") as ReportUnit | null) || undefined;
  const period = url.searchParams.get("period") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const timezone = url.searchParams.get("timezone") || undefined;

  try {
    const report = await getProjectReportDetail({
      projectKey,
      versionId,
      unit,
      period,
      from,
      to,
      timezone,
    });

    if (!report) {
      return NextResponse.json(
        { error: "not_found", message: `Không tìm thấy thông tin dự án '${projectKey}'.` },
        { status: 404 }
      );
    }

    const riskResult = await getProjectRiskTasks({
      projectKey,
      versionId,
      limit: 500, // Export up to 500 risk tasks
    });

    const csvContent = generateProjectReportCsv(report, riskResult?.tasks || []);

    const periodStr = `${report.period.from}_${report.period.to}`;
    const versionLabel = report.scope.versionName
      ? `-${report.scope.versionName.replace(/[^a-zA-Z0-9._-]/g, "_")}`
      : "";
    const filename = `project-report-${projectKey.toLowerCase()}${versionLabel}-${periodStr}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to export project report",
      },
      { status: 500 }
    );
  }
}
