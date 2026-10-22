import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, isRealAdmin, IMPERSONATE_COOKIE_NAME } from "@/lib/session";
import { recordActivity } from "@/lib/activity/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getSession();
    if (!session || !isRealAdmin(session)) {
      return NextResponse.json(
        { error: "Forbidden: Chỉ quản trị viên mới có quyền này." },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.delete(IMPERSONATE_COOKIE_NAME);

    const adminId = session.impersonator?.id || session.user?.id || "unknown";
    const adminName = session.impersonator?.name || session.user?.name || "Admin";

    void recordActivity({
      userId: adminId,
      userName: adminName,
      eventType: "auth",
      action: "auth.impersonate.stop",
      description: `Admin ${adminName} đã dừng chế độ đóng vai người dùng`,
      path: "/api/admin/impersonate/stop",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({
      message: "POST /api/admin/impersonate/stop failed",
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
