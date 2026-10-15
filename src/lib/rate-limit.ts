/**
 * Simple in-memory rate limiter for auth attempts.
 * Tracks attempts per IP within a sliding time window.
 */

type AttemptRecord = {
  timestamps: number[];
};

const attempts = new Map<string, AttemptRecord>();

// Clean up stale IP records every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStale(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [ip, record] of attempts.entries()) {
    const valid = record.timestamps.filter((t) => now - t < windowMs);
    if (valid.length === 0) {
      attempts.delete(ip);
    } else {
      record.timestamps = valid;
    }
  }
}

/**
 * Check if an identifier (account or IP) has exceeded the allowed number of auth attempts.
 * Returns true if allowed, false if rate limited.
 * Unknown or empty identifiers fall back to a dedicated unknown bucket instead of bypassing.
 * In addition, requests are checked against a coarse global bucket to protect against spray attacks.
 */
export function checkAuthRateLimit(
  key: string,
  maxAttempts: number = 10,
  windowMs: number = 60 * 1000,
  globalMaxAttempts: number = maxAttempts * 5
): boolean {
  cleanupStale(windowMs);

  const now = Date.now();
  const normalizedKey = key && key !== "unknown" ? key.trim().toLowerCase() : null;

  // 1. Check coarse global bucket
  const globalRecord = attempts.get("__global__") ?? { timestamps: [] };
  globalRecord.timestamps = globalRecord.timestamps.filter((t) => now - t < windowMs);
  if (globalRecord.timestamps.length >= globalMaxAttempts) {
    return false;
  }

  // 2. Check identifier-specific bucket (or __unknown__ if absent)
  const targetKey = normalizedKey ?? "__unknown__";
  const record = attempts.get(targetKey) ?? { timestamps: [] };
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);
  if (record.timestamps.length >= maxAttempts) {
    return false;
  }

  // Record successful token consumption in both specific and global buckets
  record.timestamps.push(now);
  attempts.set(targetKey, record);

  globalRecord.timestamps.push(now);
  attempts.set("__global__", globalRecord);

  return true;
}

/** Reset rate limit for tests */
export function _resetRateLimits(): void {
  attempts.clear();
}
