import { NextResponse } from "next/server";
import { guardProjectReport } from "@/lib/reports/route-guard";
import { getProjectReportDetail } from "@/lib/reports/project-query";
import type { ReportUnit } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectKey: string }> }
) {
  const guard = await guardProjectReport(params);
  if (guard.response) return guard.response;
  const { projectKey } = guard;

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
