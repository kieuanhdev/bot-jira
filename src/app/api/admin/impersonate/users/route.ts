import { NextResponse } from "next/server";
import { getSession, isRealAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !isRealAdmin(session)) {
      return NextResponse.json(
        { error: "Forbidden: Chỉ quản trị viên mới có quyền xem danh sách này." },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        displayName: true,
        email: true,
        jiraUsername: true,
        role: true,
        jiraVerifiedAt: true,
      },
      orderBy: { displayName: "asc" },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        jiraUsername: u.jiraUsername,
        role: u.role,
        hasJiraLinked: Boolean(u.jiraVerifiedAt),
      })),
    });
  } catch (err) {
    logger.error({
      message: "GET /api/admin/impersonate/users failed",
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
