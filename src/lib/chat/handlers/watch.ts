import { prisma } from "@/lib/prisma";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";

export async function handleWatchCommand(
  cmd: Extract<ChatCommand, { kind: "watch" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  for (const key of cmd.keys) {
    await prisma.watch.upsert({
      where: { userId_jiraKey: { userId: ctx.userId, jiraKey: key } },
      update: {},
      create: { userId: ctx.userId, jiraKey: key },
    });
  }
  return {
    status: "ok",
    blocks: [{ kind: "text", text: `Now watching: ${cmd.keys.join(", ")}` }],
    text: `Now watching: ${cmd.keys.join(", ")}`,
  };
}

export async function handleUnwatchCommand(
  cmd: Extract<ChatCommand, { kind: "unwatch" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  for (const key of cmd.keys) {
    await prisma.watch.deleteMany({ where: { userId: ctx.userId, jiraKey: key } });
  }
  return {
    status: "ok",
    blocks: [{ kind: "text", text: `Stopped watching: ${cmd.keys.join(", ")}` }],
    text: `Stopped watching: ${cmd.keys.join(", ")}`,
  };
}
