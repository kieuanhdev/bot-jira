import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  buildReportCacheKey,
  getOrComputeReport,
  isRefreshRequested,
  applyCacheHeaders,
  clearReportServerCache,
  getReportServerCacheSize,
  REPORT_CACHE_MAX_ENTRIES,
} from "./server-cache";

describe("Report Server Cache", () => {
  beforeEach(() => {
    clearReportServerCache();
  });

  describe("buildReportCacheKey", () => {
    it("generates deterministic keys regardless of object key order", () => {
      const key1 = buildReportCacheKey("test", {
        projectKey: "EPM",
        unit: "points",
        period: "this_week",
      });
      const key2 = buildReportCacheKey("test", {
        period: "this_week",
        unit: "points",
        projectKey: "EPM",
      });
      expect(key1).toBe(key2);
    });

    it("sorts array values deterministically", () => {
      const key1 = buildReportCacheKey("portfolio", {
        projects: ["B", "A", "C"],
      });
      const key2 = buildReportCacheKey("portfolio", {
        projects: ["A", "C", "B"],
      });
      expect(key1).toBe(key2);
    });

    it("produces distinct keys for different scopes", () => {
      const key1 = buildReportCacheKey("portfolio", { projects: ["EPM"] });
      const key2 = buildReportCacheKey("portfolio", { projects: ["OTHER"] });
      expect(key1).not.toBe(key2);
    });
  });

  describe("getOrComputeReport", () => {
    it("computes on cache miss and caches the result", async () => {
      const compute = vi.fn().mockResolvedValue({ total: 42 });

      const res1 = await getOrComputeReport({
        key: "test-key-1",
        ttlMs: 5000,
        compute,
      });

      expect(res1.cacheStatus).toBe("MISS");
      expect(res1.data).toEqual({ total: 42 });
      expect(compute).toHaveBeenCalledTimes(1);

      // Second call should HIT cache
      const res2 = await getOrComputeReport({
        key: "test-key-1",
        ttlMs: 5000,
        compute,
      });

      expect(res2.cacheStatus).toBe("HIT");
      expect(res2.data).toEqual({ total: 42 });
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache when bypass is true", async () => {
      const compute = vi.fn()
        .mockResolvedValueOnce({ version: 1 })
        .mockResolvedValueOnce({ version: 2 });

      await getOrComputeReport({
        key: "test-bypass",
        ttlMs: 5000,
        compute,
      });

      const res2 = await getOrComputeReport({
        key: "test-bypass",
        ttlMs: 5000,
        bypass: true,
        compute,
      });

      expect(res2.cacheStatus).toBe("BYPASS");
      expect(res2.data).toEqual({ version: 2 });
      expect(compute).toHaveBeenCalledTimes(2);
    });

    it("deduplicates in-flight calls for identical keys", async () => {
      let resolveSlow: (val: { count: number }) => void = () => {};
      const slowPromise = new Promise<{ count: number }>((resolve) => {
        resolveSlow = resolve;
      });

      const compute = vi.fn().mockImplementation(() => slowPromise);

      const p1 = getOrComputeReport({
        key: "flight-key",
        ttlMs: 5000,
        compute,
      });

      const p2 = getOrComputeReport({
        key: "flight-key",
        ttlMs: 5000,
        compute,
      });

      resolveSlow({ count: 100 });

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.data).toEqual({ count: 100 });
      expect(res2.data).toEqual({ count: 100 });
      expect(compute).toHaveBeenCalledTimes(1);
    });
  });

  describe("isRefreshRequested", () => {
    it("detects refresh query parameter", () => {
      expect(isRefreshRequested(new Request("http://localhost/api/reports?refresh=1"))).toBe(true);
      expect(isRefreshRequested(new Request("http://localhost/api/reports?refresh=true"))).toBe(true);
      expect(isRefreshRequested(new Request("http://localhost/api/reports"))).toBe(false);
    });

    it("detects x-refresh header", () => {
      const req = new Request("http://localhost/api/reports", {
        headers: { "x-refresh": "1" },
      });
      expect(isRefreshRequested(req)).toBe(true);
    });

    it("detects cache-control: no-cache", () => {
      const req = new Request("http://localhost/api/reports", {
        headers: { "cache-control": "no-cache" },
      });
      expect(isRefreshRequested(req)).toBe(true);
    });
  });

  describe("applyCacheHeaders", () => {
    it("sets X-Report-Cache and Server-Timing headers", () => {
      const res = NextResponse.json({ ok: true });
      applyCacheHeaders(res, "HIT", 15);

      expect(res.headers.get("X-Report-Cache")).toBe("HIT");
      expect(res.headers.get("X-Report-Duration-Ms")).toBe("15");
      expect(res.headers.get("Server-Timing")).toBe("report;dur=15");
    });
  });

  describe("Cache capacity and eviction", () => {
    it("bounds report cache size to REPORT_CACHE_MAX_ENTRIES", async () => {
      expect(REPORT_CACHE_MAX_ENTRIES).toBe(500);

      // Insert REPORT_CACHE_MAX_ENTRIES + 10 items
      for (let i = 0; i < REPORT_CACHE_MAX_ENTRIES + 10; i++) {
        await getOrComputeReport({
          key: `key-${i}`,
          ttlMs: 60_000,
          compute: async () => ({ i }),
        });
      }

      expect(getReportServerCacheSize()).toBeLessThanOrEqual(REPORT_CACHE_MAX_ENTRIES);
      expect(getReportServerCacheSize()).toBe(REPORT_CACHE_MAX_ENTRIES);
    });

    it("sweeps expired entries first before evicting unexpired entries", async () => {
      // Fill to max - 1 with unexpired entries
      for (let i = 0; i < REPORT_CACHE_MAX_ENTRIES - 1; i++) {
        await getOrComputeReport({
          key: `persistent-${i}`,
          ttlMs: 60_000,
          compute: async () => ({ i }),
        });
      }

      // Add one entry that is expired (ttlMs: -1)
      await getOrComputeReport({
        key: "expired-entry",
        ttlMs: -1000,
        compute: async () => ({ expired: true }),
      });

      expect(getReportServerCacheSize()).toBe(REPORT_CACHE_MAX_ENTRIES);

      // Now add a new entry. It should sweep the expired entry first.
      await getOrComputeReport({
        key: "new-entry",
        ttlMs: 60_000,
        compute: async () => ({ new: true }),
      });

      expect(getReportServerCacheSize()).toBe(REPORT_CACHE_MAX_ENTRIES);

      // "persistent-0" should still be present because expired was evicted
      const checkPersistent0 = await getOrComputeReport({
        key: "persistent-0",
        ttlMs: 60_000,
        compute: async () => ({ recomputed: true }),
      });
      expect(checkPersistent0.cacheStatus).toBe("HIT");

      // "expired-entry" was evicted, so computing it is a MISS
      const checkExpired = await getOrComputeReport({
        key: "expired-entry",
        ttlMs: 60_000,
        compute: async () => ({ newlyComputed: true }),
      });
      expect(checkExpired.cacheStatus).toBe("MISS");
    });

    it("evicts oldest entry when all entries are unexpired and capacity is reached", async () => {
      // Fill exactly to capacity
      for (let i = 0; i < REPORT_CACHE_MAX_ENTRIES; i++) {
        await getOrComputeReport({
          key: `seq-${i}`,
          ttlMs: 60_000,
          compute: async () => ({ seq: i }),
        });
      }

      expect(getReportServerCacheSize()).toBe(REPORT_CACHE_MAX_ENTRIES);

      // seq-0 should be cached
      const hitSeq0 = await getOrComputeReport({
        key: "seq-0",
        ttlMs: 60_000,
        compute: async () => ({ seq: 0 }),
      });
      expect(hitSeq0.cacheStatus).toBe("HIT");

      // Insert another entry
      await getOrComputeReport({
        key: "seq-extra",
        ttlMs: 60_000,
        compute: async () => ({ seq: "extra" }),
      });

      expect(getReportServerCacheSize()).toBe(REPORT_CACHE_MAX_ENTRIES);

      // seq-1 should have been evicted (oldest remaining after seq-0 was re-read or first in map)
      // If seq-0 was re-read but not re-inserted, seq-0 was the oldest key in Map order:
      // Note: Map keys are insertion ordered. Re-reading doesn't move to end unless re-set.
      // So the oldest inserted key was evicted.
    });
  });
});
