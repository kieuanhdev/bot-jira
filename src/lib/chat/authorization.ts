import { JiraRequestError } from "@/lib/jira/client";
import { env } from "@/lib/env";
import type { ChatBlock } from "./index";
import type { ExecContext, CommandResult } from "./types";

/**
 * Check whether an error from Jira (or local operation) indicates lack of permission.
 */
export function isBlockedError(e: unknown): boolean {
  if (e instanceof JiraRequestError) return e.status === 403 || e.status === 401;
  const m = e instanceof Error ? e.message : "";
  return /forbidden|403|not allowed|permission/i.test(m);
}

/**
 * Convert structured chat blocks into plain fallback text.
 */
export function blocksToText(blocks: ChatBlock[]): string {
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

/**
 * Web deep link to an issue.
 */
export function issueLink(key: string): string {
  return `${env.publicBaseUrl}/issue/${key}`;
}

/**
 * Verify if the caller has any of the required roles.
 */
export function hasRole(ctx: ExecContext, allowedRoles: string[]): boolean {
  return allowedRoles.includes(ctx.role);
}

/**
 * Release check RBAC guard: only admin or release_manager can run release checks.
 */
export function checkReleasePermission(ctx: ExecContext): CommandResult | null {
  if (hasRole(ctx, ["admin", "release_manager"])) {
    return null;
  }
  return {
    status: "blocked",
    blocks: [{ kind: "text", text: "Only release_manager or admin can run /release." }],
    text: "Only release_manager or admin can run /release.",
  };
}
