import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/events/signatures";
import type { Source } from "@/lib/events/store";

export type WebhookHeaders = Headers;

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
