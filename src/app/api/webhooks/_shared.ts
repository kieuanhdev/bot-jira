import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/events/signatures";
import { ingestEvent, type Source } from "@/lib/events/store";
import { logSwallowed } from "@/lib/logger";

export type WebhookHeaders = Headers;

export type WebhookExtracted = {
  externalId: string;
  type: string;
  subject?: string | null;
};

/**
 * Read the raw body of a webhook request, verify the signature, and return the
 * parsed JSON. On failure returns a 401/400 Response the caller should
 * `return` directly. The raw body is verified byte-for-byte so the HMAC is
 * stable across content encodings.
 */
export async function readAndVerifyWebhook(
  source: Source,
  req: Request
): Promise<{ ok: true; body: string; json: unknown } | { ok: false; response: NextResponse }> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "unreadable body" }, { status: 400 }) };
  }
  if (!verifyWebhookSignature(source, req.headers, raw)) {
    return { ok: false, response: NextResponse.json({ error: "invalid signature" }, { status: 401 }) };
  }
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "invalid json" }, { status: 400 }) };
  }
  return { ok: true, body: raw, json };
}

/** Simple per-source in-memory rate limit: max `limit` requests per `windowMs`. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const g = globalThis as unknown as { __webhookRateLimit?: Map<string, number[]> };
  if (!g.__webhookRateLimit) g.__webhookRateLimit = new Map();
  const m = g.__webhookRateLimit;
  const hits = (m.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const oldest = Math.min(...hits);
    m.set(key, hits);
    return { allowed: false, retryAfterMs: Math.max(1, windowMs - (now - oldest)) };
  }
  hits.push(now);
  m.set(key, hits);
  return { allowed: true };
}

/** Reset in-memory webhook rate limits for tests */
export function _resetWebhookRateLimits(): void {
  const g = globalThis as unknown as { __webhookRateLimit?: Map<string, number[]> };
  g.__webhookRateLimit?.clear();
}

/**
  * Shared webhook pipeline:
  * 1. Reads raw body & verifies HMAC signature (or fail closed in production)
  * 2. Enforces per-source rate limit (100 req / 10s)
  * 3. Extracts event metadata (externalId, type, subject)
  * 4. Ingests into event store with deduplication
  * 5. Enqueues event for background processing worker
  * 6. Returns standard response (200, 400, 401, 429, 500)
  */
export async function handleWebhook(
  source: Source,
  req: Request,
  extract: (json: unknown) => WebhookExtracted | null
): Promise<Response> {
  const parsed = await readAndVerifyWebhook(source, req);
  if (!parsed.ok) return parsed.response;

  const rl = rateLimit(source, 100, 10_000);
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "rate limited" }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const extracted = extract(parsed.json);
  if (!extracted) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const result = await ingestEvent({
    source,
    externalId: extracted.externalId,
    type: extracted.type,
    subject: extracted.subject ?? null,
    payload: parsed.json,
  });

  if (result.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!result.stored || !result.eventId) {
    return NextResponse.json({ error: "failed to store event" }, { status: 500 });
  }

  try {
    const { enqueueWebhookEvent } = await import("@/lib/queue/boss");
    await enqueueWebhookEvent({ source, eventId: result.eventId });
  } catch (err) {
    logSwallowed(`${source}_webhook_enqueue`, err, { eventId: result.eventId });
  }

  return NextResponse.json({ ok: true });
}
