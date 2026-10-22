import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { getMyWorkAnalytics } from "@/lib/my-work/service";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const weeks = parseInt(searchParams.get("weeks") || "8", 10);

  const data = await getMyWorkAnalytics(guard.session.user, isNaN(weeks) ? 8 : weeks);
  return NextResponse.json(data);
}
