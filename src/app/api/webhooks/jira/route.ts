import { NextResponse } from "next/server";
import { handleWebhook } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Jira webhook receiver (M5-02).
 *
 * Jira Server/DC webhook payload: `{ event: "jira:issue_updated", webHookEvent:
 * { key, author, changelog: { items: [{ field, fieldtype, from, to }] } } }`.
 *
 * External event id: Jira does not send a unique event id, so we synthesize
 * one from the issue key + the most specific field + the value being set. This
 * is enough to deduplicate retries of the same change without blocking
 * legitimate rapid edits (different `from`/`to` values produce different ids).
 */
export function jiraExternalId(json: unknown): string {
  const j = json as {
    timestamp?: number | string;
    webhookEvent?: string;
    issue?: { key?: string; fields?: { updated?: string } };
    comment?: { id?: string };
    changelog?: {
      id?: string;
      items?: Array<{ field?: string; fieldtype?: string; from?: string; to?: string }>;
    };
    webHookEvent?: string | {
      key?: string;
      changelog?: { items?: Array<{ field?: string; fieldtype?: string; from?: string; to?: string }> };
    };
    event?: string;
  };
  const legacyEnvelope = typeof j.webHookEvent === "object" ? j.webHookEvent : undefined;
  const key = legacyEnvelope?.key ?? j.issue?.key ?? "unknown";
  const items = legacyEnvelope?.changelog?.items ?? j.changelog?.items ?? [];
  const itemsKey = items
    .map((i) => `${i.fieldtype ?? ""}:${i.field ?? ""}:${i.from ?? ""}:${i.to ?? ""}`)
    .sort()
    .join("|");
  const eventName = j.event ?? j.webhookEvent ??
    (typeof j.webHookEvent === "string" ? j.webHookEvent : undefined) ?? "event";
  const occurrence = j.comment?.id ?? j.changelog?.id ?? j.timestamp ??
    j.issue?.fields?.updated ?? itemsKey;
  return `${eventName}:${key}:${occurrence}:${itemsKey}`;
}

export function jiraType(json: unknown): string {
  const j = json as { event?: string; webhookEvent?: string; webHookEvent?: string | object };
  return j.event ?? j.webhookEvent ??
    (typeof j.webHookEvent === "string" ? j.webHookEvent : undefined) ?? "unknown";
}

export function jiraSubject(json: unknown): string | null {
  const j = json as { issue?: { key?: string }; webHookEvent?: string | { key?: string } };
  return (typeof j.webHookEvent === "object" ? j.webHookEvent.key : undefined) ??
    j.issue?.key ?? null;
}

export async function POST(req: Request) {
  return handleWebhook("jira", req, (json) => ({
    externalId: jiraExternalId(json),
    type: jiraType(json),
    subject: jiraSubject(json),
  }));
}

/** Health check so Jira admins can verify the endpoint is reachable. */
export async function GET() {
  return NextResponse.json({ ok: true, source: "jira" });
}
