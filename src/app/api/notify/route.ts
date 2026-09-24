import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}_${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.indexOf("_");
    if (idx === -1) return null;
    const iso = raw.slice(0, idx);
    const id = raw.slice(idx + 1);
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()) || !id) return null;
    return { createdAt: date, id };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : 20, 100));
  const unreadOnly = url.searchParams.get("unreadOnly") === "1" || url.searchParams.get("unreadOnly") === "true";
  const type = url.searchParams.get("type") || undefined;
  const cursorParam = url.searchParams.get("cursor");
  const decodedCursor = cursorParam ? decodeCursor(cursorParam) : null;

  const whereClause: Prisma.NotificationWhereInput = {
    userId: session.user.id,
    ...(unreadOnly ? { read: false } : {}),
    ...(type ? { type } : {}),
    ...(decodedCursor
      ? {
          OR: [
            { createdAt: { lt: decodedCursor.createdAt } },
            { createdAt: decodedCursor.createdAt, id: { lt: decodedCursor.id } },
          ],
        }
      : {}),
  };

  const [rawItems, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: whereClause,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        type: true,
        severity: true,
        title: true,
        body: true,
        link: true,
        read: true,
        readAt: true,
        eventKey: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId: session.user.id, read: false },
    }),
  ]);

  let nextCursor: string | null = null;
  let items = rawItems;
  if (rawItems.length > limit) {
    items = rawItems.slice(0, limit);
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
  }

  return NextResponse.json({
    items,
    unreadCount,
    nextCursor,
  });
}
