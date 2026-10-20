import { NextResponse } from "next/server";
import { APP_TIMEZONE } from "@/lib/date";
import { guardProjectReport } from "@/lib/reports/route-guard";
import { getProjectReportDetail } from "@/lib/reports/project-query";
import type { ReportUnit } from "@/lib/reports/types";
import {
  buildReportCacheKey,
  getOrComputeReport,
  isRefreshRequested,
  applyCacheHeaders,
} from "@/lib/reports/server-cache";

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

  const bypass = isRefreshRequested(req);
  const cacheKey = buildReportCacheKey("project-detail", {
    projectKey,
    versionId: versionId || "",
    unit: unit || "auto",
    period: period || "this_week",
    from: from || "",
    to: to || "",
    timezone: timezone || APP_TIMEZONE,
    comparePrevious,
    includeSubtasks,
  });

  try {
    const { data: report, cacheStatus, durationMs } = await getOrComputeReport({
      key: cacheKey,
      ttlMs: 60_000,
      bypass,
      compute: () =>
        getProjectReportDetail({
          projectKey,
          versionId,
          unit,
          period,
          from,
          to,
          timezone,
          comparePrevious,
          includeSubtasks,
        }),
    });


    if (!report) {
      return NextResponse.json(
        { error: "not_found", message: `Không tìm thấy thông tin dự án '${projectKey}'.` },
        { status: 404 }
      );
    }

    const res = NextResponse.json(report);
    return applyCacheHeaders(res, cacheStatus, durationMs);
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

