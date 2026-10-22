import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, isRealAdmin, IMPERSONATE_COOKIE_NAME } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { recordActivity } from "@/lib/activity/service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !isRealAdmin(session)) {
      return NextResponse.json(
        { error: "Forbidden: Chỉ quản trị viên mới có quyền chuyển đổi tài khoản." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.targetUserId;

    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json(
        { error: "targetUserId is required" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        displayName: true,
        email: true,
        role: true,
        jiraUsername: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "Người dùng không tồn tại" },
        { status: 404 }
      );
    }

    // Determine the real admin identity (either from impersonator or session.user)
    const adminId = session.impersonator?.id || session.user?.id || "unknown";
    const adminName = session.impersonator?.name || session.user?.name || "Admin";

    const cookieStore = await cookies();
    cookieStore.set(IMPERSONATE_COOKIE_NAME, targetUser.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 4 * 60 * 60, // 4 hours
    });

    void recordActivity({
      userId: adminId,
      userName: adminName,
      eventType: "auth",
      action: "auth.impersonate.start",
      description: `Admin ${adminName} bắt đầu đóng vai người dùng ${targetUser.displayName} (${targetUser.jiraUsername || targetUser.email || targetUser.id})`,
      path: "/api/admin/impersonate",
      metadata: {
        targetUserId: targetUser.id,
        targetUserName: targetUser.displayName,
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: targetUser.id,
        displayName: targetUser.displayName,
        email: targetUser.email,
        jiraUsername: targetUser.jiraUsername,
        role: targetUser.role,
      },
    });
  } catch (err) {
    logger.error({
      message: "POST /api/admin/impersonate failed",
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
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
      path: "/api/admin/impersonate",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({
      message: "DELETE /api/admin/impersonate failed",
      error: (err as Error).message,
      stack: (err as Error).stack,
    });
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 }
    );
  }
}
