/** Per-user Discord notification delivery through the existing outbox worker. */

import { prisma } from "@/lib/prisma";
import type { ChatMessagePayload } from "@/lib/chat";
import type { NotifyType } from "./index";

export function chatDedupeKey(userId: string, type: NotifyType, eventId: string): string {
  return `${userId}:discord:${type}:${eventId}`;
}

export type ChatDeliverResult = {
  delivered: boolean;
  skippedReason?: "no_destination" | "already_queued" | "no_event_id";
};

/**
 * Queue a Discord delivery only when this user has configured a destination.
 */
export async function deliverToChat(args: {
  userId: string;
  type: NotifyType;
  title: string;
  body?: string;
  link?: string | null;
  eventId?: string;
  scheduledAt?: Date;
}): Promise<ChatDeliverResult> {
  if (!args.eventId) return { delivered: false, skippedReason: "no_event_id" };

  const destination = await prisma.discordIntegration.findUnique({
    where: { userId: args.userId },
    select: { id: true },
  });
  if (!destination) return { delivered: false, skippedReason: "no_destination" };

  const key = chatDedupeKey(args.userId, args.type, args.eventId);
  try {
    await prisma.notificationOutbox.create({
      data: {
        userId: args.userId,
        channel: "discord",
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

/** Deliver a queued row to its owner's destination; false means it was removed. */
export async function sendChatOutbox(row: {
  userId: string;
  title: string;
  body: string;
  link: string | null;
}): Promise<boolean> {
  const { resolveDiscordDestination } = await import("@/lib/chat/discord-integration");
  const destination = await resolveDiscordDestination(row.userId);
  if (!destination) return false;
  const { sendDiscordDirectMessage, sendDiscordWebhook } = await import("@/lib/chat/discord");
  const payload: ChatMessagePayload = {
    text: row.title,
    blocks: [
      { kind: "text", text: row.title },
      ...(row.body ? [{ kind: "text" as const, text: row.body }] : []),
      ...(row.link ? [{ kind: "link" as const, label: "Open in web", url: row.link }] : []),
    ],
    url: row.link ?? undefined,
  };
  if (destination.type === "webhook") {
    await sendDiscordWebhook(destination.webhookUrl, payload);
  } else {
    await sendDiscordDirectMessage(destination.discordUserId, payload);
  }
  return true;
}
