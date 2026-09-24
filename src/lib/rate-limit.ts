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
 * Check if an IP has exceeded the allowed number of auth attempts.
 * Returns true if allowed, false if rate limited.
 */
export function checkAuthRateLimit(
  ip: string,
  maxAttempts: number = 10,
  windowMs: number = 60 * 1000
): boolean {
  if (!ip || ip === "unknown") return true;

  cleanupStale(windowMs);

  const now = Date.now();
  const record = attempts.get(ip) ?? { timestamps: [] };
  // Keep only timestamps within window
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= maxAttempts) {
    return false;
  }

  record.timestamps.push(now);
  attempts.set(ip, record);
  return true;
}

/** Reset rate limit for tests */
export function _resetRateLimits(): void {
  attempts.clear();
}
