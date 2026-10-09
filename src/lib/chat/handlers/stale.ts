import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { ChatBlock } from "../index";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";
import { blocksToText, issueLink } from "../authorization";

export async function handleStaleCommand(
  _cmd: Extract<ChatCommand, { kind: "stale" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const cutoff = new Date(Date.now() - env.staleDays * 24 * 60 * 60 * 1000);
  const where: Record<string, unknown> = {
    updatedAt: { not: null, lt: cutoff },
    statusCategory: { notIn: ["done"] },
  };
  if (ctx.jiraUsername) where.assigneeJira = { in: [ctx.jiraUsername, `${ctx.jiraUsername}_mb`] };

  const rows = await prisma.issueCache.findMany({
    where,
    orderBy: { updatedAt: "asc" },
    take: 10,
    select: { jiraKey: true, summary: true, status: true, assigneeJira: true, updatedAt: true },
  });

  if (rows.length === 0) {
    return {
      status: "info",
      blocks: [{ kind: "text", text: "No stale tasks found." }],
      text: "No stale tasks found.",
    };
  }

  const staleDays = (d: Date | null) =>
    Math.max(0, Math.floor((Date.now() - (d?.getTime() ?? Date.now())) / 86_400_000));

  const blocks: ChatBlock[] = [{ kind: "text", text: `Stale (over ${env.staleDays}d):` }];
  for (const r of rows) {
    blocks.push({
      kind: "fields",
      fields: [
        {
          label: r.jiraKey,
          value: `${r.summary || "—"} — ${r.status} (${staleDays(r.updatedAt)}d)`,
          inline: false,
        },
      ],
    });
    blocks.push({ kind: "link", label: `Open ${r.jiraKey}`, url: issueLink(r.jiraKey) });
  }

  return { status: "ok", blocks, text: blocksToText(blocks) };
}
