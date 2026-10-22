import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { getCFDData } from "@/lib/reports/agile-analytics";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const projectKey = searchParams.get("projectKey") || "";
  const days = parseInt(searchParams.get("days") || "30", 10);

  const data = await getCFDData(projectKey, isNaN(days) ? 30 : days);
  return NextResponse.json(data);
}
