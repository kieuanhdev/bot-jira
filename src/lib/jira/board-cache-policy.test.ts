import { describe, expect, it, vi } from "vitest";
import { createBoardCachePolicy } from "./board-cache-policy";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("board-cache-policy", () => {
  it("classifies fresh, stale, and expired windows at their boundaries", () => {
    let now = 1_000;
    const cache = createBoardCachePolicy<string>({
      freshForMs: 100,
      staleForMs: 500,
      now: () => now,
    });

    cache.write("board", "snapshot");
    expect(cache.read("board").state).toBe("fresh");

    now = 1_100;
    expect(cache.read("board")).toMatchObject({ state: "stale", entry: { data: "snapshot" } });

    now = 1_500;
    expect(cache.read("board")).toMatchObject({ state: "expired", entry: { data: "snapshot" } });
  });

  it("exposes one tracked request to concurrent callers", async () => {
    const cache = createBoardCachePolicy<string>({ freshForMs: 100, staleForMs: 500 });
    const request = deferred<string>();
    const load = vi.fn(() => request.promise);

    const first = load();
    cache.track("board", first);
    const second = cache.getInFlight("board");

    expect(second).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);

    request.resolve("fresh");
    await expect(second).resolves.toBe("fresh");
    await Promise.resolve();
    expect(cache.hasInFlight("board")).toBe(false);
  });

  it("keeps stale data and releases the request slot after a failed refresh", async () => {
    let now = 1_000;
    const cache = createBoardCachePolicy<string>({
      freshForMs: 100,
      staleForMs: 500,
      now: () => now,
    });
    cache.write("board", "stale snapshot");
    now = 1_100;

    const refresh = deferred<string>();
    cache.track("board", refresh.promise);
    refresh.reject(new Error("Jira unavailable"));

    await expect(refresh.promise).rejects.toThrow("Jira unavailable");
    await Promise.resolve();
    expect(cache.hasInFlight("board")).toBe(false);
    expect(cache.read("board")).toMatchObject({
      state: "stale",
      entry: { data: "stale snapshot" },
    });
  });

  it("clears cached data and in-flight bookkeeping", () => {
    const cache = createBoardCachePolicy<string>({ freshForMs: 100, staleForMs: 500 });
    const request = deferred<string>();
    cache.write("board", "snapshot");
    cache.track("board", request.promise);

    cache.clear();

    expect(cache.read("board")).toEqual({ state: "missing", entry: null });
    expect(cache.hasInFlight("board")).toBe(false);
    request.resolve("ignored");
  });
});
