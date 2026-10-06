import { NextResponse } from "next/server";
import { guardProjectReport } from "@/lib/reports/route-guard";
import { getProjectMembers } from "@/lib/reports/member-query";
import { resolveReportPeriod } from "@/lib/reports/period";
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
  const periodParam = url.searchParams.get("period");
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const timezoneParam = url.searchParams.get("timezone");
  const versionId = url.searchParams.get("versionId") || undefined;
  const unit = (url.searchParams.get("unit") as ReportUnit | null) || undefined;

  const { period, comparisonPeriod } = resolveReportPeriod({
    period: periodParam,
    from: fromParam,
    to: toParam,
    timezone: timezoneParam,
  });

  try {
    const result = await getProjectMembers({
      projectKey,
      period,
      comparisonPeriod,
      versionId,
      unit,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to query member report",
      },
      { status: 500 }
    );
  }
}
