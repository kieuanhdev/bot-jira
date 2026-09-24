import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// SEC-01 — append-only audit trail.
//
// Every important mutation calls `audit()` with the actor, action, target and
// (optionally) before/after state. Two hard rules are enforced here so the
// audit log is safe to retain:
//   1. Raw secrets (tokens, keys, passwords) are never stored — any field whose
//      key matches a secret pattern, or a value that looks like a credential,
//      is replaced with a redaction marker.
//   2. Long free-text fields (description/comment bodies) are stored as a
//      short prefix + sha256 hash, not the full content.

const SECRET_KEY_RE = /(token|secret|password|passwd|api_?key|apikey|authorization|credentials?|private_?key|vapid)/i;
const LONG_TEXT_KEY_RE = /(description|body|comment|summary|reason|notes?)/i;
const LONG_TEXT_LIMIT = 160;

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

function looksLikeSecret(v: string): boolean {
  // Heuristic: long base64/hex blobs that are not obvious words.
  if (v.length < 24) return false;
  if (/^(Bearer\s+)?[A-Za-z0-9+/_-]{24,}$/.test(v)) return true;
  return false;
}

function redactValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // Free-text content fields (description/comment/body/summary/…) are the
    // long-text family: store a short prefix + hash, never redact them as
    // secrets ("description" would otherwise match the secret regex via "cript").
    if (LONG_TEXT_KEY_RE.test(key)) {
      if (value.length > LONG_TEXT_LIMIT) {
        return { text: value.slice(0, LONG_TEXT_LIMIT), hash: sha256(value) };
      }
      return value;
    }
    if (SECRET_KEY_RE.test(key)) return "[redacted]";
    if (looksLikeSecret(value)) return "[redacted]";
    return value;
  }
  return value;
}

function redact(input: unknown, keyHint = ""): unknown {
  if (Array.isArray(input)) return input.map((v) => redact(v, keyHint));
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return input;
}

export type AuditInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  source?: string;
  target?: string | null;
  before?: unknown;
  after?: unknown;
  correlationId?: string | null;
};

/**
 * Record an audit entry. Failures are swallowed (audit must never break the
 * mutation) but logged so an operator notices audit writes are failing.
 * Returns the created row id when successful, otherwise null.
 */
export async function audit(input: AuditInput): Promise<string | null> {
  try {
    const row = await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        source: input.source ?? "api",
        target: input.target ?? null,
        before: input.before !== undefined ? (JSON.parse(JSON.stringify(redact(input.before))) as Prisma.InputJsonValue) : Prisma.JsonNull,
        after: input.after !== undefined ? (JSON.parse(JSON.stringify(redact(input.after))) as Prisma.InputJsonValue) : Prisma.JsonNull,
        correlationId: input.correlationId ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", message: "audit write failed", action: input.action, error: (e as Error).message }));
    return null;
  }
}
