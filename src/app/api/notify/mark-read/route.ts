import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { NotifyMarkReadBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const MAX_IDS = 100;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsedBody = await readJsonBody(req, NotifyMarkReadBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const now = new Date();

  if (body.all) {
    let beforeDate: Date | undefined;
    if (body.before) {
      const parsed = new Date(body.before);
      if (!Number.isNaN(parsed.getTime())) {
        beforeDate = parsed;
      }
    }

    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        read: false,
        ...(beforeDate ? { createdAt: { lte: beforeDate } } : {}),
      },
      data: {
        read: true,
        readAt: now,
      },
    });
  } else if (body.ids && body.ids.length > 0) {
    const ids = body.ids.slice(0, MAX_IDS);
    const markAsUnread = Boolean(body.unread);

    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        id: { in: ids },
      },
      data: markAsUnread
        ? { read: false, readAt: null }
        : { read: true, readAt: now },
    });
  } else {
    return NextResponse.json({ error: "ids or all required" }, { status: 400 });
  }

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });

  return NextResponse.json({ ok: true, unreadCount });
}
