/**
 * M6-01 — Vendor-neutral chat provider contract (ADR-005).
 *
 * The domain layer only depends on `ChatProvider` and `ChatPayload`; it never
 * talks to a specific vendor. A concrete adapter (see `./discord.ts`) is
 * selected at runtime by `env.chatProvider`. Adding Slack or Teams later means
 * implementing this interface, not touching command/notification logic.
 *
 * Identity rule (ADR-005): a chat account must be explicitly linked to a Team
 * Task Web user. Commands run with that user's role and Jira credential; the
 * chat token is never a Jira identity. Unlinked authors cannot mutate.
 */

export type ChatProviderName = "discord" | "slack" | "teams";

/** A single piece of structured content to render in chat. */
export type ChatBlock =
  | { kind: "text"; text: string; mention?: string }
  | { kind: "fields"; fields: { label: string; value: string; inline?: boolean }[] }
  | { kind: "divider" }
  | { kind: "link"; label: string; url: string };

export type ChatMessagePayload = {
  /** Plain fallback text shown when blocks are not supported. */
  text: string;
  blocks?: ChatBlock[];
  /** Optional deep-link into the web app, surfaced as an action button when supported. */
  url?: string;
};

/** An inbound chat message, normalized from any vendor. */
export type InboundMessage = {
  provider: ChatProviderName;
  /** The platform's stable message id (for reply/audit correlation). */
  externalMessageId: string;
  /** The platform's stable author id. */
  externalAuthorId: string;
  /** Best-effort human display name of the author. */
  authorName?: string;
  /** The raw text content, whitespace-trimmed. */
  text: string;
  /** Channel/thread id the message arrived in, when the vendor exposes one. */
  channelId?: string;
};

export type ChatProvider = {
  readonly name: ChatProviderName;
  /** Send a rendered message to a channel and return the new message id. */
  send(channelId: string, payload: ChatMessagePayload): Promise<string>;
  /** Reply to a specific message (used for preview/confirm round-trips). */
  reply(channelId: string, externalMessageId: string, payload: ChatMessagePayload): Promise<string>;
};

/**
 * Resolve the active ChatProvider from the environment. Returns null when no
 * chat provider is configured, so callers can no-op outbound delivery instead
 * of crashing.
 */
export async function getChatProvider(): Promise<ChatProvider | null> {
  const { env } = await import("@/lib/env");
  switch (env.chatProvider) {
    case "discord": {
      const { hasDiscordConfig } = await import("./discord");
      if (!hasDiscordConfig()) return null;
      const { discordProvider } = await import("./discord");
      return discordProvider;
    }
    default:
      return null;
  }
}
