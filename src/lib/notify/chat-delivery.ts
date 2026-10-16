/** Per-user Discord notification delivery through the existing outbox worker. */

import { prisma } from "@/lib/prisma";
import type { ChatMessagePayload } from "@/lib/chat";
import type { NotifyType } from "./index";
import type { NotifySourceType } from "./index";
import { TYPE_LABELS } from "./notification-types";

export function chatDedupeKey(userId: string, type: NotifyType, eventId: string): string {
  return `${userId}:discord:${type}:${eventId}`;
}

/** How long the first queued row of a digest group waits for siblings. */
export const CHAT_DIGEST_WINDOW_MS = 3 * 60_000;
const DIGEST_MARKER = ":digest:";
const DIGEST_SEP = "|";
const DIGEST_MAX_LINES = 8;

/** Dedupe key of a batched row; everything up to `|` identifies its group. */
export function chatDigestDedupeKey(
  userId: string,
  type: NotifyType,
  group: string,
  eventId: string
): string {
  return `${chatDedupeKey(userId, type, `digest:${group}`)}${DIGEST_SEP}${eventId}`;
}

/** Group prefix of a batched Discord row's dedupe key, or null for ordinary rows. */
export function chatDigestGroupPrefix(dedupeKey: string | null | undefined): string | null {
  if (!dedupeKey || !dedupeKey.includes(DIGEST_MARKER)) return null;
  const i = dedupeKey.indexOf(DIGEST_SEP);
  return i > 0 ? dedupeKey.slice(0, i + 1) : null;
}

/** Merge queued rows of one digest group (oldest first) into a single message. */
export function buildChatDigest<T extends { title: string; body: string; link: string | null }>(
  rows: T[]
): { title: string; body: string; link: string | null } {
  const [first] = rows;
  if (rows.length === 1) return { title: first.title, body: first.body, link: first.link };
  const clip = (text: string) => (text.length > 160 ? `${text.slice(0, 157)}...` : text);
  const lines = rows.slice(0, DIGEST_MAX_LINES).map((r) => `• ${clip(r.body || r.title)}`);
  if (rows.length > DIGEST_MAX_LINES) {
    lines.push(`… và ${rows.length - DIGEST_MAX_LINES} bình luận khác`);
  }
  return {
    title: `${first.title} (${rows.length} bình luận)`,
    body: lines.join("\n"),
    link: first.link,
  };
}

export type ChatDeliverResult = {
  delivered: boolean;
  skippedReason?: "no_destination" | "already_queued" | "no_event_id";
  /** When the row will be sent, if not immediately. */
  scheduledAt?: Date;
};

export function inferNotificationTone(title: string, body: string): "info" | "success" | "warning" | "danger" {
  const text = `${title} ${body}`.toLowerCase();
  if (/thất bại|failed|failure|lỗi|error|khẩn cấp|chặn phát hành/.test(text)) return "danger";
  if (/cảnh báo|warning|quá hạn|tồn đọng|stale|không phải leader|sắp đến hạn/.test(text)) return "warning";
  if (/thành công|success|phục hồi|recovered|sẵn sàng|ready/.test(text)) return "success";
  return "info";
}

function notificationTypeFromDedupeKey(dedupeKey?: string | null): string | null {
  return dedupeKey?.match(/^[^:]+:discord:([^:]+):/)?.[1] ?? null;
}

/**
 * Queue a Discord delivery only when this user has configured a destination.
 * With `digestGroup`, the row joins the group's open window (or opens a new
 * CHAT_DIGEST_WINDOW_MS one) and the delivery worker sends the group as one message.
 */
export async function deliverToChat(args: {
  userId: string;
  type: NotifyType;
  title: string;
  body?: string;
  link?: string | null;
  sourceLink?: string | null;
  sourceType?: NotifySourceType | null;
  eventId?: string;
  scheduledAt?: Date;
  digestGroup?: string;
}): Promise<ChatDeliverResult> {
  if (!args.eventId) return { delivered: false, skippedReason: "no_event_id" };

  const destination = await prisma.discordIntegration.findUnique({
    where: { userId: args.userId },
    select: { id: true },
  });
  if (!destination) return { delivered: false, skippedReason: "no_destination" };

  const digest = Boolean(args.digestGroup && args.eventId.startsWith(`${args.digestGroup}:`));
  const key = digest
    ? chatDigestDedupeKey(args.userId, args.type, args.digestGroup!, args.eventId)
    : chatDedupeKey(args.userId, args.type, args.eventId);
  let scheduledAt = args.scheduledAt;
  if (digest) {
    const open = await prisma.notificationOutbox.findFirst({
      where: {
        channel: "discord",
        state: "pending",
        dedupeKey: { startsWith: chatDigestGroupPrefix(key)! },
        scheduledAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    });
    scheduledAt = open?.scheduledAt ?? new Date(Date.now() + CHAT_DIGEST_WINDOW_MS);
  }
  try {
    await prisma.notificationOutbox.create({
      data: {
        userId: args.userId,
        channel: "discord",
        title: args.title,
        body: args.body ?? "",
        link: args.link ?? null,
        sourceLink: args.sourceLink ?? null,
        sourceType: args.sourceType ?? null,
        dedupeKey: key,
        state: "pending",
        scheduledAt: scheduledAt ?? null,
      },
    });
    return { delivered: true, scheduledAt };
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
  sourceLink?: string | null;
  sourceType?: string | null;
  dedupeKey?: string | null;
}): Promise<boolean> {
  const { resolveDiscordDestination } = await import("@/lib/chat/discord-integration");
  const destination = await resolveDiscordDestination(row.userId);
  if (!destination) return false;
  const { sendDiscordDirectMessage, sendDiscordWebhook, resolveAbsoluteUrl } = await import("@/lib/chat/discord");
  const fullUrl = resolveAbsoluteUrl(row.link ?? undefined);
  const sourceUrl = resolveAbsoluteUrl(row.sourceLink ?? undefined);
  const sourceLabel = row.sourceType === "jira" ? "Mở trên Jira" : "Mở trên Git";
  const sourceName = row.sourceType === "jira" ? "Jira" : row.sourceType === "git" ? "Git" : "Team Task Web";
  const notificationType = notificationTypeFromDedupeKey(row.dedupeKey);
  const actions = [
    fullUrl ? `[Mở trên web](${fullUrl})` : null,
    sourceUrl && sourceUrl !== fullUrl ? `[${sourceLabel}](${sourceUrl})` : null,
  ].filter((action): action is string => Boolean(action));
  const payload: ChatMessagePayload = {
    text: row.title,
    blocks: [
      {
        kind: "fields",
        fields: [
          ...(row.body ? [{ label: "Nội dung chính", value: row.body, inline: false }] : []),
          { label: "Nguồn", value: sourceName, inline: true },
          ...(notificationType
            ? [{ label: "Loại thông báo", value: TYPE_LABELS[notificationType] ?? notificationType, inline: true }]
            : []),
          ...(actions.length > 0
            ? [{ label: "Hành động", value: actions.join("  •  "), inline: false }]
            : []),
        ],
      },
    ],
    url: fullUrl ?? undefined,
    tone: inferNotificationTone(row.title, row.body),
    footer: `Team Task Web • ${sourceName}`,
  };
  if (destination.type === "webhook") {
    await sendDiscordWebhook(destination.webhookUrl, payload);
  } else {
    await sendDiscordDirectMessage(destination.discordUserId, payload);
  }
  return true;
}
