import { NextResponse } from "next/server";
import { ingestEvent, type Source } from "@/lib/events/store";
import { rateLimit, readAndVerifyWebhook } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * Bitbucket Data Center webhook receiver (M5-02).
 *
 * Payload: `{ eventKey: "pr:opened|pr:merged|repo:refs_changed|...", data: {
 * repository: { slug, project: { key } }, pullRequest?: { id, state,
 * fromRef: { branch }, toRef: { branch } }, branches?: [...] } }`.
 *
 * External event id: Bitbucket DC does not send a unique event id, so we
 * synthesize one from eventKey + repo + the most specific subject (PR id or
 * branch name). This dedupes redeliveries of the same PR state change.
 */
function bbExternalId(json: unknown): string {
  const j = json as {
    eventKey?: string;
    data?: {
      repository?: { slug?: string; project?: { key?: string } };
      pullRequest?: { id?: number; state?: string };
      branches?: Array<{ name?: string }>;
    };
  };
  const repo = j.data?.repository
    ? `${j.data.repository.project?.key ?? "?"}/${j.data.repository.slug ?? "?"}`
    : "unknown";
  const pr = j.data?.pullRequest;
  const branch = j.data?.branches?.[0]?.name;
  const subject = pr ? `pr-${pr.id}-${pr.state ?? ""}` : branch ? `branch-${branch}` : "event";
  return `${j.eventKey ?? "event"}:${repo}:${subject}`;
}

export async function POST(req: Request) {
  const source: Source = "bitbucket";
  const rl = rateLimit(source, 100, 10_000);
  if (!rl.allowed) {
    const res = NextResponse.json({ error: "rate limited" }, { status: 429 });
    if (rl.retryAfterMs) res.headers.set("Retry-After", String(Math.ceil(rl.retryAfterMs / 1000)));
    return res;
  }

  const parsed = await readAndVerifyWebhook(source, req);
  if (!parsed.ok) return parsed.response;

  const j = parsed.json as {
    eventKey?: string;
    data?: {
      repository?: { slug?: string; project?: { key?: string } };
      pullRequest?: { id?: number };
    };
  };
  const externalId = bbExternalId(parsed.json);
  const result = await ingestEvent({
    source,
    externalId,
    type: j.eventKey ?? "bitbucket-event",
    subject: j.data?.repository
      ? `${j.data.repository.project?.key ?? "?"}/${j.data.repository.slug ?? "?"}`
      : null,
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
  return NextResponse.json({ ok: true, source: "bitbucket" });
}
