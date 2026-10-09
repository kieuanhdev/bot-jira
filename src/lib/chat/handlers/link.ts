import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";

export async function handleLinkCommand(
  _cmd: Extract<ChatCommand, { kind: "link" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const existing = await prisma.chatIdentity.findFirst({
    where: { provider: ctx.provider, externalId: ctx.externalAuthorId },
  });
  if (existing) {
    return {
      status: "info",
      blocks: [{ kind: "text", text: "This chat account is already linked to your account." }],
      text: "This chat account is already linked.",
    };
  }
  return {
    status: "info",
    blocks: [
      { kind: "text", text: "Link your chat account from the web app: Settings → Chat." },
      { kind: "link", label: "Open settings", url: `${env.publicBaseUrl}/settings` },
    ],
    text: "Link your chat account from the web app (Settings → Chat).",
  };
}

export async function handleUnlinkCommand(
  _cmd: Extract<ChatCommand, { kind: "unlink" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const { unlinkChatIdentity } = await import("../identity");
  await unlinkChatIdentity(ctx.userId, ctx.provider);
  return {
    status: "unlinked",
    blocks: [{ kind: "text", text: "Your chat account is now unlinked. Commands are disabled." }],
    text: "Your chat account is now unlinked. Commands are disabled.",
  };
}
