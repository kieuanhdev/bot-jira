import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { listUserActivities } from "@/lib/activity/service";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const result = await listUserActivities({
    userId: guard.session.user.id,
    page: isNaN(page) ? 1 : page,
    limit: isNaN(limit) ? 20 : limit,
  });

  return NextResponse.json(result);
}
