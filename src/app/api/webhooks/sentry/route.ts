import { NextResponse } from "next/server";
import { handleWebhook } from "../_shared";

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
  return handleWebhook("sentry", req, (json) => {
    const j = json as { action?: string; issue?: { shortId?: string } };
    return {
      externalId: sentryExternalId(json),
      type: j.action ?? "sentry-event",
      subject: j.issue?.shortId ?? null,
    };
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, source: "sentry" });
}
