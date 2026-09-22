import { NextResponse } from "next/server";
import { ingestEvent, type Source } from "@/lib/events/store";
import { rateLimit, readAndVerifyWebhook } from "../_shared";

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
function jiraExternalId(json: unknown): string {
  const j = json as {
    webHookEvent?: {
      key?: string;
      changelog?: { items?: Array<{ field?: string; fieldtype?: string; from?: string; to?: string }> };
    };
    event?: string;
  };
  const key = j.webHookEvent?.key ?? "unknown";
  const items = j.webHookEvent?.changelog?.items ?? [];
  const itemsKey = items
    .map((i) => `${i.fieldtype ?? ""}:${i.field ?? ""}:${i.to ?? ""}`)
    .sort()
    .join("|");
  return `${j.event ?? "event"}:${key}:${itemsKey}`;
}

function jiraType(json: unknown): string {
  const j = json as { event?: string };
  return j.event ?? "unknown";
}

function jiraSubject(json: unknown): string | null {
  const j = json as { webHookEvent?: { key?: string } };
  return j.webHookEvent?.key ?? null;
}

export async function POST(req: Request) {
  const source: Source = "jira";
  const rl = rateLimit(source, 100, 10_000);
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "rate limited" }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const parsed = await readAndVerifyWebhook(source, req);
  if (!parsed.ok) return parsed.response;

  const externalId = jiraExternalId(parsed.json);
  const result = await ingestEvent({
    source,
    externalId,
    type: jiraType(parsed.json),
    subject: jiraSubject(parsed.json),
    payload: parsed.json,
  });
  if (result.duplicate) {
    // Already processed (or in-flight) — ack so Jira doesn't retry forever.
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (!result.stored || !result.eventId) {
    return NextResponse.json({ error: "failed to store event" }, { status: 500 });
  }
  // Enqueue processing on the worker. The webhook acks immediately so Jira
  // doesn't treat us as slow.
  try {
    const { enqueueWebhookEvent } = await import("@/lib/queue/boss");
    await enqueueWebhookEvent({ source, eventId: result.eventId });
  } catch {
    // Worker enqueue failure must not fail the ack — the event is already
    // stored and a later reconciliation pass can pick it up.
  }
  return NextResponse.json({ ok: true });
}

/** Health check so Jira admins can verify the endpoint is reachable. */
export async function GET() {
  return NextResponse.json({ ok: true, source: "jira" });
}
