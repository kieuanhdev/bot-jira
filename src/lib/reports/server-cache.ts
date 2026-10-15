import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export type ReportCacheStatus = "HIT" | "MISS" | "BYPASS";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  computedAt: number;
}

// In-memory server cache store
export const REPORT_CACHE_MAX_ENTRIES = 500;
const reportCache = new Map<string, CacheEntry<unknown>>();
// In-flight deduplication to avoid thundering herd / stampede
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getReportServerCacheSize(): number {
  return reportCache.size;
}

const REPORT_CACHE_VERSION = "v1";

/**
 * Generates a stable deterministic hash for a cache key.
 */
export function buildReportCacheKey(
  prefix: string,
  parts: Record<string, unknown>
): string {
  const sortedKeys = Object.keys(parts).sort();
  const serialized = sortedKeys
    .map((k) => {
      const v = parts[k];
      if (Array.isArray(v)) {
        return `${k}:${[...v].sort().join(",")}`;
      }
      return `${k}:${String(v ?? "")}`;
    })
    .join("|");

  const hash = createHash("sha256").update(serialized, "utf8").digest("hex").slice(0, 16);
  return `${REPORT_CACHE_VERSION}:${prefix}:${hash}`;
}

/**
 * Checks if client explicitly requested a cache bypass / fresh computation.
 */
export function isRefreshRequested(req: Request): boolean {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true") {
      return true;
    }
  } catch {
    // ignore
  }

  const refreshHeader = req.headers.get("x-refresh");
  if (refreshHeader === "1" || refreshHeader === "true") {
    return true;
  }

  const cacheControl = req.headers.get("cache-control");
  if (cacheControl && cacheControl.includes("no-cache")) {
    return true;
  }

  return false;
}

export interface GetOrComputeOptions<T> {
  key: string;
  ttlMs: number;
  bypass?: boolean;
  compute: () => Promise<T>;
}

export interface GetOrComputeResult<T> {
  data: T;
  cacheStatus: ReportCacheStatus;
  durationMs: number;
}

/**
 * Retrieves a cached report calculation or computes and stores it.
 * Features in-flight request deduplication and safe bypass.
 */
export async function getOrComputeReport<T>(
  options: GetOrComputeOptions<T>
): Promise<GetOrComputeResult<T>> {
  const { key, ttlMs, bypass = false, compute } = options;
  const start = performance.now();
  const now = Date.now();

  // 1. If not bypassing, check cache
  if (!bypass) {
    const existing = reportCache.get(key) as CacheEntry<T> | undefined;
    if (existing) {
      if (existing.expiresAt > now) {
        const durationMs = Math.round(performance.now() - start);
        return {
          data: existing.data,
          cacheStatus: "HIT",
          durationMs,
        };
      } else {
        reportCache.delete(key);
      }
    }
  }

  // 2. In-flight request deduplication
  let inFlight = inFlightRequests.get(key) as Promise<T> | undefined;
  let cacheStatus: ReportCacheStatus = bypass ? "BYPASS" : "MISS";

  if (!inFlight) {
    inFlight = (async () => {
      try {
        const result = await compute();
        const writeNow = Date.now();

        // Evict if at capacity before setting new key
        if (reportCache.size >= REPORT_CACHE_MAX_ENTRIES && !reportCache.has(key)) {
          // 1. Sweep expired entries
          for (const [k, v] of reportCache.entries()) {
            if (v.expiresAt <= writeNow) {
              reportCache.delete(k);
            }
          }

          // 2. If still at or above capacity, evict oldest (insertion-ordered Map)
          while (reportCache.size >= REPORT_CACHE_MAX_ENTRIES) {
            const oldestKey = reportCache.keys().next().value;
            if (!oldestKey) break;
            reportCache.delete(oldestKey);
          }
        }

        reportCache.set(key, {
          data: result,
          expiresAt: writeNow + ttlMs,
          computedAt: writeNow,
        });
        return result;
      } finally {
        inFlightRequests.delete(key);
      }
    })();

    inFlightRequests.set(key, inFlight);
  } else {
    // If we're piggybacking on an already in-flight request:
    cacheStatus = "HIT";
  }

  const data = await inFlight;
  const durationMs = Math.round(performance.now() - start);

  return {
    data,
    cacheStatus,
    durationMs,
  };
}

/**
 * Applies standard telemetry headers to the response:
 * - X-Report-Cache: HIT | MISS | BYPASS
 * - X-Report-Duration-Ms: <ms>
 * - Server-Timing: report;dur=<ms>
 */
export function applyCacheHeaders(
  res: NextResponse,
  cacheStatus: ReportCacheStatus,
  durationMs: number
): NextResponse {
  res.headers.set("X-Report-Cache", cacheStatus);
  res.headers.set("X-Report-Duration-Ms", String(durationMs));
  res.headers.set("Server-Timing", `report;dur=${durationMs}`);
  return res;
}

/**
 * Invalidates cached reports by key prefix or entirely.
 */
export function invalidateReportServerCache(prefix?: string): void {
  if (!prefix) {
    reportCache.clear();
    return;
  }
  for (const key of reportCache.keys()) {
    if (key.includes(prefix)) {
      reportCache.delete(key);
    }
  }
}

/**
 * Clear the entire report server cache (useful in tests).
 */
export function clearReportServerCache(): void {
  reportCache.clear();
  inFlightRequests.clear();
}
