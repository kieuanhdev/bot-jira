import { jiraWith } from "@/lib/jira/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import type { ChatBlock } from "../index";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";
import { isBlockedError, blocksToText } from "../authorization";
import { createConfirmation, buildAssignPreview } from "../confirmation";

export async function handleAssignCommand(
  cmd: Extract<ChatCommand, { kind: "assign" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const jira = jiraWith(ctx.jiraAuth);
  const targetWho = ctx.jiraUsername ?? ctx.userId;

  const apply = async (key: string) => {
    try {
      await jira.updateIssue(key, { assignee: targetWho });
      await refreshJiraIssueCache(jira, key).catch(() => null);
      return { ok: true, detail: `assigned to ${targetWho}` };
    } catch (e) {
      if (isBlockedError(e)) return { ok: false, blocked: true, detail: "No Jira permission to assign" };
      return { ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" };
    }
  };

  if (cmd.keys.length > 1) {
    const confirmationId = await createConfirmation(ctx, "assign", {
      keys: cmd.keys,
      who: targetWho,
    });
    return buildAssignPreview(cmd.keys, targetWho, confirmationId);
  }

  const r = await apply(cmd.keys[0]);
  const blocks: ChatBlock[] = [{ kind: "text", text: `${cmd.keys[0]} ${r.ok ? r.detail : "failed: " + r.detail}` }];
  return { status: r.blocked ? "blocked" : r.ok ? "ok" : "error", blocks, text: blocksToText(blocks) };
}
