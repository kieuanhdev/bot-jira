import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  buildReportCacheKey,
  getOrComputeReport,
  isRefreshRequested,
  applyCacheHeaders,
  clearReportServerCache,
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
});
