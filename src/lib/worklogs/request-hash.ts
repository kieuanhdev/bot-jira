import { createHash } from "crypto";

/**
 * Computes a deterministic SHA-256 hash of the normalized request parameters.
 * Used to verify whether duplicate idempotency keys have identical payloads.
 */
export function computeWorklogRequestHash(input: {
  timeSpent: string;
  startedAt: string;
  comment?: string;
  adjustEstimate?: string;
}): string {
  const normalized = JSON.stringify({
    timeSpent: input.timeSpent.trim().toLowerCase(),
    startedAt: new Date(input.startedAt).toISOString(),
    comment: (input.comment ?? "").trim(),
    adjustEstimate: input.adjustEstimate ?? "leave",
  });
  return createHash("sha256").update(normalized).digest("hex");
}
