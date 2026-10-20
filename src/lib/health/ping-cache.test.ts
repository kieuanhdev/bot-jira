import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedProbe, clearProbeCache } from "./ping-cache";

describe("cachedProbe", () => {
  beforeEach(() => {
    clearProbeCache();
    vi.useRealTimers();
  });

  it("waits on the first call and serves the cache afterwards", async () => {
    const fn = vi.fn().mockResolvedValue("a");
    expect(await cachedProbe("k", fn, { ttlMs: 1000 })).toBe("a");
    expect(await cachedProbe("k", fn, { ttlMs: 1000 })).toBe("a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns the stale value immediately and refreshes in the background", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValueOnce("old").mockResolvedValueOnce("new");
    await cachedProbe("k", fn, { ttlMs: 1000 });
    vi.advanceTimersByTime(2000);
    expect(await cachedProbe("k", fn, { ttlMs: 1000 })).toBe("old");
    await vi.runAllTimersAsync();
    expect(await cachedProbe("k", fn, { ttlMs: 1000 })).toBe("new");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("bypasses the cache when fresh is set and dedupes concurrent calls", async () => {
    const fn = vi.fn().mockImplementation(async () => "x");
    await cachedProbe("k", fn, { ttlMs: 1000 });
    await Promise.all([
      cachedProbe("k", fn, { ttlMs: 1000, fresh: true }),
      cachedProbe("k", fn, { ttlMs: 1000, fresh: true }),
    ]);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
