import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * M5-01 — Minimal integration event store.
 *
 * Every inbound webhook is persisted with its external event ID `(source, externalId)` BEFORE we
 * acknowledge the HTTP request. Duplicate deliveries (the same externalId)
 * are detected and rejected so a single external event can never produce two
 * logical notifications.
 */

export type Source = "jira" | "sentry" | "bitbucket" | "ci";

export function sourceFromPath(path: string): Source | null {
  if (path === "jira") return "jira";
  if (path === "sentry") return "sentry";
  if (path === "bitbucket") return "bitbucket";
  if (path === "ci") return "ci";
  return null;
}

/** Cap a JSON payload at `env.webhookMaxPayloadBytes` before storing. */
export function capPayload(payload: unknown): { payload: Prisma.InputJsonValue; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(payload) ?? "null";
  } catch {
    json = JSON.stringify({ error: "unserializable payload" });
  }
  if (Buffer.byteLength(json, "utf8") <= env.webhookMaxPayloadBytes) {
    return { payload: JSON.parse(json) as Prisma.InputJsonValue, truncated: false };
  }
  return {
    payload: { truncated: true, bytes: Buffer.byteLength(json, "utf8") } as Prisma.InputJsonValue,
    truncated: true,
  };
}

export type IngestResult = {
  stored: boolean;
  duplicate: boolean;
  eventId?: string;
};

/**
 * Store an inbound event. Returns `duplicate: true` when the exact same
 * `(source, externalId)` was already recorded — the caller should then ack the
 * webhook without enqueuing another job.
 */
export async function ingestEvent(args: {
  source: Source;
  externalId: string;
  type: string;
  subject?: string | null;
  payload: unknown;
}): Promise<IngestResult> {
  const { payload, truncated } = capPayload(args.payload);
  try {
    const existing = (payload as { __truncated?: boolean }).__truncated === true;
    const row = await prisma.integrationEvent.create({
      data: {
        source: args.source,
        externalId: args.externalId,
        type: args.type,
        subject: args.subject ?? null,
        payload: { ...(payload as object), __truncated: truncated || existing } as Prisma.InputJsonValue,
      },
    });
    return { stored: true, duplicate: false, eventId: row.id };
  } catch (e) {
    // Unique violation means a duplicate (source, externalId).
    if (e instanceof Error && e.message.includes("P2002")) {
      return { stored: false, duplicate: true };
    }
    throw e;
  }
}

export async function markEventProcessed(eventId: string, error?: string | null) {
  await prisma.integrationEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), processingError: error ?? null },
  });
}
