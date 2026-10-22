import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { getMyWorkTimeline } from "@/lib/my-work/service";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "14", 10);

  const data = await getMyWorkTimeline(guard.session.user, isNaN(days) ? 14 : days);
  return NextResponse.json(data);
}
