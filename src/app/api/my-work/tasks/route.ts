import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { getMyWorkTasks, TaskRoleFilter } from "@/lib/my-work/service";

export async function GET(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const role = (searchParams.get("role") || "assigned") as TaskRoleFilter;
  const status = searchParams.get("status") || "ALL";
  const search = searchParams.get("search") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const result = await getMyWorkTasks(guard.session.user, {
    role,
    status,
    search,
    page: isNaN(page) ? 1 : page,
    limit: isNaN(limit) ? 20 : limit,
  });

  return NextResponse.json(result);
}
