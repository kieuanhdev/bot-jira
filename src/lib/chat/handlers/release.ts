import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { ChatBlock } from "../index";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";
import { checkReleasePermission, blocksToText } from "../authorization";

export async function handleReleaseCommand(
  cmd: Extract<ChatCommand, { kind: "release" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const permissionError = checkReleasePermission(ctx);
  if (permissionError) {
    return permissionError;
  }

  const release = await prisma.release.findFirst({
    where: { version: cmd.version },
  });
  if (!release) {
    return {
      status: "error",
      blocks: [{ kind: "text", text: `No release found for version "${cmd.version}".` }],
      text: `No release found for version "${cmd.version}".`,
    };
  }

  const { runGates, aggregateGates, collectBlockers } = await import("@/lib/releases/gates");
  const { buildReleaseContext } = await import("@/lib/releases/release-context");
  const { aiProvider } = await import("@/lib/ai");

  const releaseCtx = await buildReleaseContext(release.id, release.version);
  if (!releaseCtx) {
    return {
      status: "error",
      blocks: [{ kind: "text", text: "Could not build release context." }],
      text: "Could not build release context.",
    };
  }

  const gates = await runGates(releaseCtx, aiProvider.releaseCheck.bind(aiProvider));
  const status = aggregateGates(gates);
  const blockers = collectBlockers(gates);
  const reasonLines = blockers.slice(0, 8).map((b) => (b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason));

  const blocks: ChatBlock[] = [
    { kind: "text", text: `Release ${release.version}: ${status}` },
    { kind: "fields", fields: gates.map((g) => ({ label: g.gate, value: g.state, inline: true })) },
  ];
  if (reasonLines.length) blocks.push({ kind: "text", text: `Blockers: ${reasonLines.join("; ")}` });
  blocks.push({ kind: "link", label: "Open release center", url: `${env.publicBaseUrl}/release` });

  return { status: status === "blocked" ? "blocked" : "ok", blocks, text: blocksToText(blocks) };
}
