import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { DeliveryState } from "@prisma/client";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const stateParam = url.searchParams.get("state") ?? "failed";
  const limitParam = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const limit = Math.max(1, Math.min(200, Number.isNaN(limitParam) ? 100 : limitParam));

  const validState = Object.values(DeliveryState).includes(stateParam as DeliveryState)
    ? (stateParam as DeliveryState)
    : DeliveryState.failed;

  const items = await prisma.notificationOutbox.findMany({
    where: { state: validState },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const userIds = Array.from(new Set(items.map((i) => i.userId).filter(Boolean)));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true },
      })
    : [];

  const userMap = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    items: items.map((r) => {
      const u = userMap.get(r.userId);
      return {
        id: r.id,
        channel: r.channel,
        userId: r.userId,
        userEmail: u?.email ?? r.userId,
        userDisplayName: u?.displayName ?? null,
        title: r.title,
        attemptCount: r.attemptCount,
        lastError: maskSecrets(r.lastError),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
  });
}
