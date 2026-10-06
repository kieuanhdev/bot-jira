import { NextResponse } from "next/server";
import { guardProjectReport } from "@/lib/reports/route-guard";
import { getProjectTasks } from "@/lib/reports/task-query";
import { resolveReportPeriod } from "@/lib/reports/period";

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
  const activity = url.searchParams.get("activity") || undefined;
  const statusGroup = url.searchParams.get("statusGroup") || undefined;
  const assignee = url.searchParams.get("assignee") || undefined;
  const risk = url.searchParams.get("risk") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const limit = url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;
  const offset = url.searchParams.get("offset") ? parseInt(url.searchParams.get("offset")!, 10) : undefined;

  const { period } = resolveReportPeriod({
    period: periodParam,
    from: fromParam,
    to: toParam,
    timezone: timezoneParam,
  });

  try {
    const result = await getProjectTasks({
      projectKey,
      period,
      versionId,
      activity,
      statusGroup,
      assignee,
      risk,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to query project tasks",
      },
      { status: 500 }
    );
  }
}
