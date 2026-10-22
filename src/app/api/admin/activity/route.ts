import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getActivityMetrics, listUserActivities } from "@/lib/activity/service";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden: Yêu cầu quyền quản trị viên" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const userId = searchParams.get("userId") || undefined;
  const eventType = searchParams.get("eventType") || undefined;
  const range = (searchParams.get("range") as "today" | "7d" | "30d" | "all") || undefined;
  const q = searchParams.get("q") || undefined;
  const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 25;

  const [metrics, activities, users] = await Promise.all([
    getActivityMetrics(),
    listUserActivities({ userId, eventType, range, q, page, limit }),
    prisma.user.findMany({
      select: {
        id: true,
        displayName: true,
        email: true,
        jiraUsername: true,
      },
      orderBy: { displayName: "asc" },
    }),
  ]);

  return NextResponse.json({
    metrics,
    items: activities.items,
    pagination: activities.pagination,
    users,
  });
}
