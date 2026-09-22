/**
 * M6-02 — Outbound chat delivery.
 *
 * Delivers a notification to the team chat channel (Discord) via the
 * vendor-neutral `ChatProvider`. The channel is a single shared channel
 * (DISCORD_CHANNEL_ID), so delivery is idempotent per logical event: the
 * dedupe key is scoped to (type, eventId) so the same event arriving twice —
 * or a webhook retry — posts at most once.
 *
 * Delivery is best-effort and never blocks the in-app / push path: callers
 * fire-and-forget with `.catch(() => null)`.
 */

import { prisma } from "@/lib/prisma";
import type { NotifyType } from "./index";

/** Build the chat dedupe key, scoped to the logical event (not per user). */
export function chatDedupeKey(type: NotifyType, eventId: string): string {
  return `chat:${type}:${eventId}`;
}

export type ChatDeliverResult = {
  delivered: boolean;
  skippedReason?: "no_provider" | "already_queued" | "no_event_id";
};

/**
 * Queue a chat delivery for a logical event. Reuses the NotificationOutbox with
 * channel "chat" so the existing delivery worker can fan it out, with the same
 * retry/backoff and dedupe semantics as push.
 */
export async function deliverToChat(args: {
  userId?: string;
  type: NotifyType;
  title: string;
  body?: string;
  link?: string | null;
  eventId?: string;
  scheduledAt?: Date;
}): Promise<ChatDeliverResult> {
  if (!args.eventId) return { delivered: false, skippedReason: "no_event_id" };

  const { getChatProvider } = await import("@/lib/chat");
  const provider = await getChatProvider();
  if (!provider) return { delivered: false, skippedReason: "no_provider" };

  const key = chatDedupeKey(args.type, args.eventId);
  try {
    await prisma.notificationOutbox.create({
      data: {
        userId: args.userId ?? "system",
        channel: "chat",
        title: args.title,
        body: args.body ?? "",
        link: args.link ?? null,
        dedupeKey: key,
        state: "pending",
        scheduledAt: args.scheduledAt ?? null,
      },
    });
    return { delivered: true };
  } catch (e) {
    if (e instanceof Error && e.message.includes("P2002")) {
      return { delivered: false, skippedReason: "already_queued" };
    }
    throw e;
  }
}

/** Actually post a queued chat outbox row to the chat channel. */
export async function sendChatOutbox(row: {
  title: string;
  body: string;
  link: string | null;
}): Promise<void> {
  const { getChatProvider } = await import("@/lib/chat");
  const provider = await getChatProvider();
  if (!provider) return;
  await provider.send("", {
    text: row.title,
    blocks: [
      { kind: "text", text: row.title },
      ...(row.body ? [{ kind: "text" as const, text: row.body }] : []),
      ...(row.link ? [{ kind: "link" as const, label: "Open in web", url: row.link }] : []),
    ],
    url: row.link ?? undefined,
  });
}
