import { NextResponse } from "next/server";
import { guardProjectReport } from "@/lib/reports/route-guard";
import { getProjectRiskTasks } from "@/lib/reports/project-query";

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
