import { jiraWith } from "@/lib/jira/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import type { ChatBlock } from "../index";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";
import { isBlockedError, blocksToText } from "../authorization";
import { createConfirmation, buildMovePreview } from "../confirmation";

export async function handleMoveCommand(
  cmd: Extract<ChatCommand, { kind: "move" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const jira = jiraWith(ctx.jiraAuth);

  const apply = async (key: string): Promise<{ ok: boolean; blocked?: boolean; detail: string }> => {
    try {
      const t = await jira.findTransition(key, cmd.status);
      if (!t) return { ok: false, detail: `No transition to "${cmd.status}" from current state` };
      await jira.transition(key, t.id);
      await refreshJiraIssueCache(jira, key).catch(() => null);
      return { ok: true, detail: `→ ${t.to?.name ?? cmd.status}` };
    } catch (e) {
      if (isBlockedError(e)) return { ok: false, blocked: true, detail: "No Jira permission to transition" };
      return { ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" };
    }
  };

  if (cmd.keys.length > 1) {
    const confirmationId = await createConfirmation(ctx, "move", {
      keys: cmd.keys,
      status: cmd.status,
    });
    return buildMovePreview(cmd.keys, cmd.status, confirmationId);
  }

  const r = await apply(cmd.keys[0]);
  const blocks: ChatBlock[] = [{ kind: "text", text: `${cmd.keys[0]} ${r.ok ? r.detail : "failed: " + r.detail}` }];
  return { status: r.blocked ? "blocked" : r.ok ? "ok" : "error", blocks, text: blocksToText(blocks) };
}
