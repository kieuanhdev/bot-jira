/**
 * M6-01 — Discord chat adapter (ADR-005).
 *
 * Vendor-specific Discord REST calls live here and nowhere else. The rest of
 * the app depends only on the `ChatProvider` interface in `./index.ts`.
 *
 * Configuration:
 *  - DISCORD_BOT_TOKEN: bot token used to post messages.
 *  - DISCORD_WEBHOOK_SECRET: shared secret for inbound webhook HMAC verification.
 *  - DISCORD_CHANNEL_ID: the channel Team Task Web posts to (outbound default).
 *
 * Outbound uses the bot token to POST rich embeds to the configured channel.
 * Inbound arrives via a webhook endpoint (`/api/webhooks/chat`) that verifies
 * the Discord `X-Discord-Signature` HMAC before trusting the payload.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { ChatMessagePayload, ChatProvider, InboundMessage } from "./index";

const DISCORD_API = "https://discord.com/api/v10";

/** Injectable for tests: default to global fetch. */
type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (input, init) => fetch(input, init);
export function setDiscordFetch(fn: FetchFn): void {
  fetchImpl = fn;
}

let cachedToken: string | null = null;
let cachedChannelId: string | null = null;

async function loadConfig() {
  const { env } = await import("@/lib/env");
  cachedToken = env.discordBotToken || null;
  cachedChannelId = env.discordChannelId || null;
}

export function hasDiscordConfig(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CHANNEL_ID);
}

/**
 * Verify a Discord webhook signature. Discord signs the raw request body with
 * the shared secret (HMAC-SHA256, hex) and sends it in `X-Discord-Signature`.
 * Returns false when no secret is configured (fail closed) or the signature
 * does not match.
 */
export function verifyDiscordSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.DISCORD_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Build a plain-text rendering of the payload (fallback for any channel). */
export function renderText(payload: ChatMessagePayload): string {
  if (!payload.blocks || payload.blocks.length === 0) return payload.text;
  const lines: string[] = [];
  for (const b of payload.blocks) {
    if (b.kind === "text") lines.push(b.text);
    else if (b.kind === "fields") for (const f of b.fields) lines.push(`**${f.label}:** ${f.value}`);
    else if (b.kind === "link") lines.push(`<${b.url}>`);
    else if (b.kind === "divider") lines.push("");
  }
  return lines.filter(Boolean).join("\n") || payload.text;
}

function toEmbed(payload: ChatMessagePayload) {
  const fields: { name: string; value: string; inline: boolean }[] = [];
  const descriptionParts: string[] = [];
  if (payload.blocks) {
    for (const b of payload.blocks) {
      if (b.kind === "text") descriptionParts.push(b.text);
      else if (b.kind === "fields") for (const f of b.fields) fields.push({ name: f.label, value: f.value, inline: f.inline !== false });
      else if (b.kind === "link") descriptionParts.push(`[${b.label}](${b.url})`);
      else if (b.kind === "divider") {
        descriptionParts.push("---");
      }
    }
  }
  const embed: Record<string, unknown> = {
    title: payload.text,
    description: descriptionParts.join("\n") || null,
  };
  if (fields.length) embed.fields = fields;
  if (payload.url) embed.url = payload.url;
  return {
    embeds: [embed],
    content: fields.length === 0 && descriptionParts.length === 0 ? payload.text : null,
  };
}

async function post(channelId: string, body: Record<string, unknown>, messageId?: string): Promise<string> {
  await loadConfig();
  if (!cachedToken) throw new Error("Discord not configured (missing DISCORD_BOT_TOKEN)");
  const url = messageId
    ? `${DISCORD_API}/channels/${channelId}/messages/${messageId}`
    : `${DISCORD_API}/channels/${channelId}/messages`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${cachedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id?: string };
  return json.id ?? "";
}

export const discordProvider: ChatProvider = {
  name: "discord",
  async send(channelId, payload) {
    await loadConfig();
    const target = channelId || cachedChannelId || "";
    if (!target) throw new Error("Discord channel not configured (DISCORD_CHANNEL_ID)");
    return post(target, toEmbed(payload));
  },
  async reply(channelId, externalMessageId, payload) {
    await loadConfig();
    const target = channelId || cachedChannelId || "";
    if (!target) throw new Error("Discord channel not configured (DISCORD_CHANNEL_ID)");
    return post(target, toEmbed(payload), externalMessageId);
  },
};

/** Normalize a raw Discord webhook payload into the vendor-neutral shape. */
export function normalizeDiscordInbound(json: unknown): InboundMessage | null {
  const j = json as {
    id?: string;
    author?: { id?: string; username?: string };
    channel_id?: string;
    content?: string;
  };
  if (!j?.author?.id || typeof j.content !== "string") return null;
  return {
    provider: "discord",
    externalMessageId: String(j.id ?? ""),
    externalAuthorId: String(j.author.id),
    authorName: j.author.username,
    text: j.content.trim(),
    channelId: j.channel_id,
  };
}
