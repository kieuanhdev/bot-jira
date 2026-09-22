import { NextResponse } from "next/server";
import { ingestEvent, type Source } from "@/lib/events/store";
import { rateLimit, readAndVerifyWebhook } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Sentry webhook receiver (M5-02).
 *
 * Payload: `{ action: "created" | "resolved" | "ignored" | ..., issue: { id,
 * shortId, title, permalinkUrl, level, project: { slug } } }`.
 *
 * External event id: Sentry's own event/issue id is not in the payload for all
 * actions, so we combine action + issue id + level to stay stable across
 * retries while still distinguishing a real level change from a redelivery.
 */
function sentryExternalId(json: unknown): string {
  const j = json as {
    action?: string;
    issue?: { id?: number; shortId?: string; level?: string; project?: { slug?: string } };
  };
  const id = j.issue?.id ?? j.issue?.shortId ?? "unknown";
  return `${j.action ?? "event"}:${j.issue?.project?.slug ?? "default"}:${id}:${j.issue?.level ?? ""}`;
}

export async function POST(req: Request) {
  const source: Source = "sentry";
  const rl = rateLimit(source, 100, 10_000);
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "rate limited" }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const parsed = await readAndVerifyWebhook(source, req);
  if (!parsed.ok) return parsed.response;

  const externalId = sentryExternalId(parsed.json);
  const j = parsed.json as { action?: string; issue?: { shortId?: string } };
  const result = await ingestEvent({
    source,
    externalId,
    type: j.action ?? "sentry-event",
    subject: j.issue?.shortId ?? null,
    payload: parsed.json,
  });
  if (result.duplicate) return NextResponse.json({ ok: true, duplicate: true });
  if (!result.stored || !result.eventId) {
    return NextResponse.json({ error: "failed to store event" }, { status: 500 });
  }
  try {
    const { enqueueWebhookEvent } = await import("@/lib/queue/boss");
    await enqueueWebhookEvent({ source, eventId: result.eventId });
  } catch {
    /* ack anyway — event is stored */
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, source: "sentry" });
}
