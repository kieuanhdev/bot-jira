import { jiraWith } from "@/lib/jira/client";
import type { ChatBlock } from "../index";
import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";
import { blocksToText, issueLink } from "../authorization";

export async function handleTaskCommand(
  cmd: Extract<ChatCommand, { kind: "task" }>,
  ctx: ExecContext
): Promise<CommandResult> {
  const rows: ChatBlock[] = [];
  for (const key of cmd.keys) {
    try {
      const issue = await jiraWith(ctx.jiraAuth).getIssue(key);
      const f = issue.fields;
      rows.push({ kind: "divider" });
      rows.push({
        kind: "text",
        text: `*${key}* — ${f.summary ?? ""}`,
      });
      rows.push({
        kind: "fields",
        fields: [
          { label: "Status", value: f.status?.name ?? "—", inline: true },
          { label: "Assignee", value: f.assignee?.displayName ?? f.assignee?.name ?? "—", inline: true },
          { label: "Priority", value: f.priority?.name ?? "—", inline: true },
          { label: "Type", value: f.issuetype?.name ?? "—", inline: true },
        ],
      });
      rows.push({ kind: "link", label: "Open in web", url: issueLink(key) });
    } catch (e) {
      rows.push({ kind: "divider" });
      rows.push({ kind: "text", text: `${key}: ${e instanceof Error ? e.message : "error"}` });
    }
  }
  return { status: "ok", blocks: rows, text: blocksToText(rows) };
}
