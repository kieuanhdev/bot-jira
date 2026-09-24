import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendPush } from "@/lib/notify/push";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { pushSubscription: true },
  });

  if (!user?.pushSubscription) {
    return NextResponse.json(
      { error: "Trình duyệt chưa đăng ký nhận thông báo đẩy." },
      { status: 400 }
    );
  }

  try {
    await sendPush(session.user.id, {
      title: "Team Task Web — Kiểm tra thông báo",
      body: "Thiết bị của bạn đã được kết nối thành công với Web Push!",
      url: "/settings",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Gửi thông báo thử thất bại: ${message}` },
      { status: 502 }
    );
  }
}
