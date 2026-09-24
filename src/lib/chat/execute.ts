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
import { jiraWith, JiraRequestError, type JiraAuth } from "@/lib/jira/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import { env } from "@/lib/env";
import type { ChatCommand } from "./commands";
import { newCorrelationId } from "./correlation";
import type { ChatBlock } from "./index";

export type CommandResult = {
  /** Rendered chat blocks (or plain text fallback). */
  blocks: ChatBlock[];
  text: string;
  status:
    | "ok"
    | "preview"
    | "confirmed"
    | "rejected"
    | "error"
    | "blocked"
    | "unlinked"
    | "unrecognized"
    | "help"
    | "linked"
    | "info";
  /** Set when a confirmation was created and is waiting for the user. */
  confirmationId?: string;
  correlationId?: string;
};

export type ExecContext = {
  userId: string;
  jiraAuth: JiraAuth;
  jiraUsername: string | null;
  role: string;
  provider: string;
  externalAuthorId: string;
  externalMessageId?: string;
  channelId?: string;
};

function isBlockedError(e: unknown): boolean {
  if (e instanceof JiraRequestError) return e.status === 403 || e.status === 401;
  const m = e instanceof Error ? e.message : "";
  return /forbidden|403|not allowed|permission/i.test(m);
}

function blocksToText(blocks: ChatBlock[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "text") return b.text;
      if (b.kind === "fields") return b.fields.map((f) => `${f.label}: ${f.value}`).join("  ");
      if (b.kind === "link") return `${b.label} ${b.url}`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function link(key: string): string {
  return `${env.publicBaseUrl}/issue/${key}`;
}

async function run(cmd: ChatCommand, ctx: ExecContext): Promise<CommandResult> {
  switch (cmd.kind) {
    case "help":
      return {
        status: "help",
        blocks: [
          { kind: "text", text: "Available commands:" },
          {
            kind: "fields",
            fields: [
              { label: "/task PROJ-123", value: "Show task details", inline: false },
              { label: '/move PROJ-123 "In Progress"', value: "Transition task(s)", inline: false },
              { label: "/assign PROJ-123 me", value: "Assign task(s) to you", inline: false },
              { label: "/watch PROJ-123", value: "Watch a task for comments", inline: false },
              { label: "/unwatch PROJ-123", value: "Stop watching", inline: false },
              { label: "/release 1.4.2 check", value: "Run release gate check", inline: false },
              { label: "/stale", value: "List stale tasks", inline: false },
              { label: "/confirm", value: "Confirm a pending bulk action", inline: false },
            ],
          },
        ],
        text: "Commands: /task, /move, /assign, /watch, /unwatch, /release ... check, /stale, /confirm",
      };

    case "task": {
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
          rows.push({ kind: "link", label: "Open in web", url: link(key) });
        } catch (e) {
          rows.push({ kind: "divider" });
          rows.push({ kind: "text", text: `${key}: ${e instanceof Error ? e.message : "error"}` });
        }
      }
      return { status: "ok", blocks: rows, text: blocksToText(rows) };
    }

    case "watch":
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

    case "unwatch": {
      for (const key of cmd.keys) {
        await prisma.watch.deleteMany({ where: { userId: ctx.userId, jiraKey: key } });
      }
      return {
        status: "ok",
        blocks: [{ kind: "text", text: `Stopped watching: ${cmd.keys.join(", ")}` }],
        text: `Stopped watching: ${cmd.keys.join(", ")}`,
      };
    }

    case "stale": {
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
        return { status: "info", blocks: [{ kind: "text", text: "No stale tasks found." }], text: "No stale tasks found." };
      }
      const staleDays = (d: Date | null) => Math.max(0, Math.floor((Date.now() - (d?.getTime() ?? Date.now())) / 86_400_000));
      const blocks: ChatBlock[] = [{ kind: "text", text: `Stale (over ${env.staleDays}d):` }];
      for (const r of rows) {
        blocks.push({ kind: "fields", fields: [
          { label: r.jiraKey, value: `${r.summary || "—"} — ${r.status} (${staleDays(r.updatedAt)}d)`, inline: false },
        ] });
        blocks.push({ kind: "link", label: `Open ${r.jiraKey}`, url: link(r.jiraKey) });
      }
      return { status: "ok", blocks, text: blocksToText(blocks) };
    }

    case "release": {
      if (ctx.role !== "admin" && ctx.role !== "release_manager") {
        return {
          status: "blocked",
          blocks: [{ kind: "text", text: `Only release_manager or admin can run /release.` }],
          text: "Only release_manager or admin can run /release.",
        };
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
        return { status: "error", blocks: [{ kind: "text", text: "Could not build release context." }], text: "Could not build release context." };
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

    case "link":
      // The user must link from the web app (they need to supply their Discord
      // id there); from chat we can only report current state.
      const existing = await prisma.chatIdentity.findFirst({ where: { provider: ctx.provider, externalId: ctx.externalAuthorId } });
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

    case "unlink": {
      const { unlinkChatIdentity } = await import("./identity");
      await unlinkChatIdentity(ctx.userId, ctx.provider);
      return {
        status: "unlinked",
        blocks: [{ kind: "text", text: "Your chat account is now unlinked. Commands are disabled." }],
        text: "Your chat account is now unlinked. Commands are disabled.",
      };
    }

    case "assign": {
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
        // Bulk: require confirmation.
        const confirmation = await prisma.chatMessageConfirmation.create({
          data: {
            provider: ctx.provider,
            externalAuthorId: ctx.externalAuthorId,
            userId: ctx.userId,
            kind: "assign",
            payload: { keys: cmd.keys, who: targetWho } as object,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        return {
          status: "preview",
          confirmationId: confirmation.id,
          blocks: [
            { kind: "text", text: `Assign ${cmd.keys.length} tasks to ${targetWho}?` },
            { kind: "fields", fields: cmd.keys.map((k) => ({ label: k, value: "assign", inline: true })) },
            { kind: "text", text: "Reply /confirm within 10 minutes to apply." },
          ],
          text: `Confirm? Assign ${cmd.keys.length} tasks. Reply /confirm.`,
        };
      }

      const r = await apply(cmd.keys[0]);
      const blocks: ChatBlock[] = [{ kind: "text", text: `${cmd.keys[0]} ${r.ok ? r.detail : "failed: " + r.detail}` }];
      return { status: r.blocked ? "blocked" : r.ok ? "ok" : "error", blocks, text: blocksToText(blocks) };
    }

    case "move": {
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
        const confirmation = await prisma.chatMessageConfirmation.create({
          data: {
            provider: ctx.provider,
            externalAuthorId: ctx.externalAuthorId,
            userId: ctx.userId,
            kind: "move",
            payload: { keys: cmd.keys, status: cmd.status } as object,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        return {
          status: "preview",
          confirmationId: confirmation.id,
          blocks: [
            { kind: "text", text: `Move ${cmd.keys.length} tasks to "${cmd.status}"?` },
            { kind: "fields", fields: cmd.keys.map((k) => ({ label: k, value: `→ ${cmd.status}`, inline: true })) },
            { kind: "text", text: "Reply /confirm within 10 minutes to apply." },
          ],
          text: `Confirm? Move ${cmd.keys.length} tasks to ${cmd.status}. Reply /confirm.`,
        };
      }

      const r = await apply(cmd.keys[0]);
      const blocks: ChatBlock[] = [{ kind: "text", text: `${cmd.keys[0]} ${r.ok ? r.detail : "failed: " + r.detail}` }];
      return { status: r.blocked ? "blocked" : r.ok ? "ok" : "error", blocks, text: blocksToText(blocks) };
    }
    default: {
      const ex = cmd as { kind: string };
      return {
        status: "unrecognized",
        blocks: [{ kind: "text", text: `Unsupported command "${ex.kind}". Type /help.` }],
        text: `Unsupported command "${ex.kind}".`,
      };
    }
  }
}

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
    await prisma.chatMessage.create({
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
    }).catch(() => null);
    return result;
  }

  const result = await run(cmd, ctx);
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

async function handleConfirm(ctx: ExecContext): Promise<CommandResult> {
  const pending = await prisma.chatMessageConfirmation.findFirst({
    where: {
      provider: ctx.provider,
      externalAuthorId: ctx.externalAuthorId,
      userId: ctx.userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pending) {
    return { status: "info", blocks: [{ kind: "text", text: "No pending action to confirm." }], text: "No pending action to confirm." };
  }

  const payload = pending.payload as { keys: string[]; who?: string; status?: string };
  const jira = jiraWith(ctx.jiraAuth);
  const results: string[] = [];

  if (pending.kind === "move") {
    for (const key of payload.keys) {
      try {
        const t = await jira.findTransition(key, payload.status ?? "");
        if (!t) { results.push(`${key}: no transition to "${payload.status}"`); continue; }
        await jira.transition(key, t.id);
        await refreshJiraIssueCache(jira, key).catch(() => null);
        results.push(`${key} → ${t.to?.name ?? payload.status}`);
      } catch (e) {
        results.push(`${key}: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
      }
    }
  } else if (pending.kind === "assign") {
    const who = payload.who ?? ctx.jiraUsername ?? ctx.userId;
    for (const key of payload.keys) {
      try {
        await jira.updateIssue(key, { assignee: who });
        await refreshJiraIssueCache(jira, key).catch(() => null);
        results.push(`${key} assigned to ${who}`);
      } catch (e) {
        results.push(`${key}: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
      }
    }
  } else {
    return { status: "error", blocks: [{ kind: "text", text: `Cannot confirm unknown action "${pending.kind}".` }], text: "Unknown action." };
  }

  await prisma.chatMessageConfirmation.update({
    where: { id: pending.id },
    data: { status: "confirmed" },
  });

  const blocks: ChatBlock[] = [{ kind: "text", text: `Applied (${results.length}):` }];
  for (const r of results) blocks.push({ kind: "text", text: `• ${r}` });
  return { status: "confirmed", blocks, text: `Applied ${results.length} actions.` };
}
