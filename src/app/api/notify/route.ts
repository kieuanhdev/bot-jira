import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { NotifyDeleteBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { encodeCursor, decodeCursor, listNotifications } from "@/lib/notify/list";

export const dynamic = "force-dynamic";

export { encodeCursor, decodeCursor };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 20, 100));
  const unreadOnly = url.searchParams.get("unreadOnly") === "1" || url.searchParams.get("unreadOnly") === "true";
  const type = url.searchParams.get("type") || undefined;
  const cursorParam = url.searchParams.get("cursor") || undefined;

  const data = await listNotifications(session.user.id, {
    limit,
    cursor: cursorParam,
    unreadOnly,
    type,
  });

  return NextResponse.json(data);
}


export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsedBody = await readJsonBody(req, NotifyDeleteBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  if (body.allRead) {
    await prisma.notification.deleteMany({
      where: {
        userId: session.user.id,
        read: true,
      },
    });
  } else if (body.all) {
    await prisma.notification.deleteMany({
      where: {
        userId: session.user.id,
      },
    });
  } else if (body.ids && body.ids.length > 0) {
    await prisma.notification.deleteMany({
      where: {
        userId: session.user.id,
        id: { in: body.ids },
      },
    });
  } else {
    return NextResponse.json({ error: "ids, allRead, or all required" }, { status: 400 });
  }

  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });

  return NextResponse.json({ ok: true, unreadCount });
}
