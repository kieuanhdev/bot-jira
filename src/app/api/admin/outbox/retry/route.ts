import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { OutboxRetryBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { enqueueNotificationDelivery } from "@/lib/queue/enqueue";
import { audit } from "@/lib/audit";
import { DeliveryState } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = await readJsonBody(req, OutboxRetryBodySchema, { allowEmpty: true });
  if (!parsedBody.ok) return parsedBody.response;

  const ids = parsedBody.data.ids?.filter(Boolean);

  let targetIds: string[] = [];
  if (ids && ids.length > 0) {
    const limited = ids.slice(0, 500);
    const existing = await prisma.notificationOutbox.findMany({
      where: { id: { in: limited }, state: DeliveryState.failed },
      select: { id: true },
      take: 500,
    });
    targetIds = existing.map((r) => r.id);
  } else {
    const existing = await prisma.notificationOutbox.findMany({
      where: { state: DeliveryState.failed },
      select: { id: true },
      take: 500,
      orderBy: { updatedAt: "desc" },
    });
    targetIds = existing.map((r) => r.id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ ok: true, count: 0, message: "No failed outbox notifications to retry" });
  }

  const result = await prisma.notificationOutbox.updateMany({
    where: { id: { in: targetIds } },
    data: {
      state: DeliveryState.pending,
      attemptCount: 0,
      scheduledAt: null,
      lastError: null,
    },
  });

  await enqueueNotificationDelivery();

  await audit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: "admin.outbox.retry",
    target: `${result.count} notifications`,
    source: "web",
  });

  return NextResponse.json({ ok: true, count: result.count });
}
