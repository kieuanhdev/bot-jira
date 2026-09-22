import { NextResponse } from "next/server";
import { ingestEvent, type Source } from "@/lib/events/store";
import { rateLimit, readAndVerifyWebhook } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Generic CI webhook receiver (M5-02). Accepts a minimal shape:
 *
 *   {
 *     "runId": "12345" | "run_id": 12345,   // required for dedupe
 *     "status": "success" | "failure" | "running" | ...,
 *     "branch": "main",
 *     "commit": "abc123",
 *     "repo": "team/app",
 *     "url": "https://ci.example/run/12345"   // optional link
 *   }
 *
 * External event id: `${status}:${repo}:${commit}:${runId}` — stable across
 * retries of the same run.
 */
function ciExternalId(json: unknown): string {
  const j = json as {
    runId?: string | number;
    run_id?: string | number;
    status?: string;
    repo?: string;
    commit?: string;
  };
  const runId = j.runId ?? j.run_id ?? "unknown";
  return `${j.status ?? "event"}:${j.repo ?? "default"}:${j.commit ?? ""}:${runId}`;
}

export async function POST(req: Request) {
  const source: Source = "ci";
  const rl = rateLimit(source, 100, 10_000);
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "rate limited" }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const parsed = await readAndVerifyWebhook(source, req);
  if (!parsed.ok) return parsed.response;

  const j = parsed.json as { status?: string; repo?: string; branch?: string };
  const externalId = ciExternalId(parsed.json);
  const result = await ingestEvent({
    source,
    externalId,
    type: `ci:${j.status ?? "unknown"}`,
    subject: j.repo ?? null,
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
  return NextResponse.json({ ok: true, source: "ci" });
}
