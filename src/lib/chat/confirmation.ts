import { prisma } from "@/lib/prisma";
import { jiraWith } from "@/lib/jira/client";
import { refreshJiraIssueCache } from "@/lib/issues/cache";
import type { ChatBlock } from "./index";
import type { ExecContext, CommandResult } from "./types";

export type PendingMovePayload = {
  keys: string[];
  status: string;
};

export type PendingAssignPayload = {
  keys: string[];
  who: string;
};

export type ConfirmationPayload = PendingMovePayload | PendingAssignPayload;

export const DEFAULT_CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Pure check whether a confirmation has expired.
 */
export function isConfirmationExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * Build preview CommandResult for multi-key assign.
 */
export function buildAssignPreview(
  keys: string[],
  targetWho: string,
  confirmationId: string
): CommandResult {
  return {
    status: "preview",
    confirmationId,
    blocks: [
      { kind: "text", text: `Assign ${keys.length} tasks to ${targetWho}?` },
      { kind: "fields", fields: keys.map((k) => ({ label: k, value: "assign", inline: true })) },
      { kind: "text", text: "Reply /confirm within 10 minutes to apply." },
    ],
    text: `Confirm? Assign ${keys.length} tasks. Reply /confirm.`,
  };
}

/**
 * Build preview CommandResult for multi-key move.
 */
export function buildMovePreview(
  keys: string[],
  status: string,
  confirmationId: string
): CommandResult {
  return {
    status: "preview",
    confirmationId,
    blocks: [
      { kind: "text", text: `Move ${keys.length} tasks to "${status}"?` },
      { kind: "fields", fields: keys.map((k) => ({ label: k, value: `→ ${status}`, inline: true })) },
      { kind: "text", text: "Reply /confirm within 10 minutes to apply." },
    ],
    text: `Confirm? Move ${keys.length} tasks to ${status}. Reply /confirm.`,
  };
}

/**
 * Create a pending confirmation record in the database.
 */
export async function createConfirmation(
  ctx: ExecContext,
  kind: "move" | "assign",
  payload: ConfirmationPayload,
  ttlMs = DEFAULT_CONFIRMATION_TTL_MS
): Promise<string> {
  const confirmation = await prisma.chatMessageConfirmation.create({
    data: {
      provider: ctx.provider,
      externalAuthorId: ctx.externalAuthorId,
      userId: ctx.userId,
      kind,
      payload: payload as object,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return confirmation.id;
}

/**
 * Find the latest pending confirmation that has not expired.
 */
export async function findPendingConfirmation(ctx: ExecContext) {
  return prisma.chatMessageConfirmation.findFirst({
    where: {
      provider: ctx.provider,
      externalAuthorId: ctx.externalAuthorId,
      userId: ctx.userId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Execute and mark confirmed the currently pending action.
 */
export async function handleConfirm(ctx: ExecContext): Promise<CommandResult> {
  const pending = await findPendingConfirmation(ctx);
  if (!pending) {
    return {
      status: "info",
      blocks: [{ kind: "text", text: "No pending action to confirm." }],
      text: "No pending action to confirm.",
    };
  }

  const payload = pending.payload as { keys: string[]; who?: string; status?: string };
  const jira = jiraWith(ctx.jiraAuth);
  const results: string[] = [];

  if (pending.kind === "move") {
    for (const key of payload.keys) {
      try {
        const t = await jira.findTransition(key, payload.status ?? "");
        if (!t) {
          results.push(`${key}: no transition to "${payload.status}"`);
          continue;
        }
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
    return {
      status: "error",
      blocks: [{ kind: "text", text: `Cannot confirm unknown action "${pending.kind}".` }],
      text: "Unknown action.",
    };
  }

  await prisma.chatMessageConfirmation.update({
    where: { id: pending.id },
    data: { status: "confirmed" },
  });

  const blocks: ChatBlock[] = [{ kind: "text", text: `Applied (${results.length}):` }];
  for (const r of results) blocks.push({ kind: "text", text: `• ${r}` });
  return { status: "confirmed", blocks, text: `Applied ${results.length} actions.` };
}
