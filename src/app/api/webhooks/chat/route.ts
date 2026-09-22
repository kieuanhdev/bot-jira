import { NextResponse } from "next/server";
import { verifyDiscordSignature, normalizeDiscordInbound } from "@/lib/chat/discord";
import { findUserByChatIdentity } from "@/lib/chat/identity";
import { parseChatCommand } from "@/lib/chat/commands";
import { executeChatCommand } from "@/lib/chat/execute";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";

export const dynamic = "force-dynamic";

/**
 * M6-01 — Discord inbound webhook.
 *
 * Receives Discord message events, verifies the HMAC signature, maps the
 * author to a linked Team Task Web user, parses the command, executes it with
 * that user's role + Jira credential, and posts the result back to Discord.
 *
 * The chat token is never a Jira identity: the author must be linked via
 * ChatIdentity, and commands run with the linked user's own Jira credential.
 */
export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "unreadable body" }, { status: 400 });
  }

  // Discord signs the raw body with the shared secret (HMAC-SHA256 hex).
  const signature = req.headers.get("x-discord-signature") ?? undefined;
  if (!verifyDiscordSignature(raw, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const inbound = normalizeDiscordInbound(json);
  if (!inbound) return NextResponse.json({ ok: true, ignored: true });

  // Bot-ignored / empty content.
  if (!inbound.text) return NextResponse.json({ ok: true, ignored: true });

  // Resolve the linked user. Unlinked authors get a prompt to link.
  const identity = await findUserByChatIdentity(inbound.provider, inbound.externalAuthorId);
  const providerName = "discord";

  let result;
  if (!identity) {
    result = {
      status: "unlinked" as const,
      blocks: [
        { kind: "text" as const, text: "Link your account first: open Settings → Chat in the web app and paste your Discord user id." },
      ],
      text: "Link your account first (Settings → Chat).",
    };
  } else {
    const user = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true, role: true },
    });
    const cmd = parseChatCommand(inbound.text);
    result = await executeChatCommand(cmd, inbound.text, {
      userId: identity.userId,
      jiraAuth: userJiraAuth(user),
      jiraUsername: identity.jiraUsername,
      role: user?.role ?? "member",
      provider: providerName,
      externalAuthorId: inbound.externalAuthorId,
      externalMessageId: inbound.externalMessageId,
      channelId: inbound.channelId,
    });
  }

  // Post the result back to Discord (best-effort; never fail the ack).
  try {
    const { getChatProvider } = await import("@/lib/chat");
    const provider = await getChatProvider();
    if (provider && inbound.channelId) {
      await provider.reply(inbound.channelId, inbound.externalMessageId, {
        text: result.text,
        blocks: result.blocks,
      });
    }
  } catch {
    /* outbound delivery failure must not fail the webhook ack */
  }

  return NextResponse.json({ ok: true, status: result.status });
}

export async function GET() {
  return NextResponse.json({ ok: true, source: "chat" });
}
