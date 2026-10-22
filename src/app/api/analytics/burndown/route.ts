import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { getBurndownData } from "@/lib/reports/agile-analytics";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const projectKey = searchParams.get("projectKey") || "";
  const releaseId = searchParams.get("releaseId") || undefined;

  const data = await getBurndownData(projectKey, releaseId);
  return NextResponse.json(data);
}
