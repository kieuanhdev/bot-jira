/**
 * M6-03 — Chat command executor.
 *
 * Takes a normalized `ChatCommand` (from `./commands.ts`) plus the linked
 * user, and produces a chat-renderable `CommandResult`. It is the single place
 * where chat intent becomes a side effect, and it enforces the M6 safety laws:
 *
 *  - RBAC: only `release_manager`/`admin` may run a release check.
 *  - Jira permission: mutations go through the user's own Jira credential
 *    (their token) via `userJiraAuth` — the chat token is never a Jira
 *    identity, so Jira-side permissions are enforced upstream.
 *  - Bulk/multi-key mutations require confirmation before any Jira write.
 *  - Every command is stored in ChatMessage with a correlation id (audit trail).
 *  - A Jira 403 surfaces as `blocked`, not `ok`.
 */

import { prisma } from "@/lib/prisma";
import type { ChatCommand } from "./commands";
import { newCorrelationId } from "./correlation";
import type { CommandResult, ExecContext } from "./types";
import { handleConfirm } from "./confirmation";
import { dispatchChatCommand } from "./handlers";

export type { CommandResult, CommandStatus, ExecContext } from "./types";
export { isBlockedError } from "./authorization";
export { handleConfirm } from "./confirmation";

/**
 * Execute a parsed chat command. Persists the command + result to ChatMessage
 * (the audit trail) and returns the chat-renderable result.
 */
export async function executeChatCommand(
  cmd: ChatCommand,
  raw: string,
  ctx: ExecContext
): Promise<CommandResult> {
  const correlationId = newCorrelationId();

  if (cmd.kind === "confirm") {
    const result = await handleConfirm(ctx);
    await prisma.chatMessage
      .create({
        data: {
          provider: ctx.provider,
          externalAuthorId: ctx.externalAuthorId,
          authorUserId: ctx.userId,
          command: "confirm",
          raw,
          status: result.status,
          result: { correlationId, text: result.text } as object,
          correlationId,
        },
      })
      .catch(() => null);
    return { ...result, correlationId };
  }

  if (cmd.kind === "unknown") {
    const result: CommandResult = {
      status: "unrecognized",
      blocks: [{ kind: "text", text: cmd.hint ?? "I didn't understand that. Type /help." }],
      text: cmd.hint ?? "I didn't understand that.",
      correlationId,
    };
    await prisma.chatMessage
      .create({
        data: {
          provider: ctx.provider,
          externalAuthorId: ctx.externalAuthorId,
          authorUserId: ctx.userId,
          command: null,
          raw,
          status: "unrecognized",
          result: { correlationId } as object,
          correlationId,
        },
      })
      .catch(() => null);
    return result;
  }

  const result = await dispatchChatCommand(cmd, ctx);
  const status = result.status;
  await prisma.chatMessage
    .create({
      data: {
        provider: ctx.provider,
        externalAuthorId: ctx.externalAuthorId,
        authorUserId: ctx.userId,
        command: cmd.kind,
        raw,
        status,
        result: { correlationId, text: result.text, confirmationId: result.confirmationId } as object,
        correlationId,
      },
    })
    .catch(() => null);
  return { ...result, correlationId };
}
