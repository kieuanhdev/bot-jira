import { LRUCache } from "lru-cache";

export type BoardCacheEntry<T> = {
  data: T;
  expiresAt: number;
  staleUntil: number;
};

export type BoardCacheRead<T> =
  | { state: "fresh" | "stale" | "expired"; entry: BoardCacheEntry<T> }
  | { state: "missing"; entry: null };

type WriteOptions = {
  freshForMs?: number;
  staleForMs?: number;
  now?: number;
};

type BoardCachePolicyOptions = {
  freshForMs: number;
  staleForMs: number;
  now?: () => number;
  /** Upper bound on cached keys; least recently used entries are evicted. */
  maxEntries?: number;
};

/**
 * Owns the in-memory cache clock and the shared foreground/background request
 * registry used by Jira board reads. Fetching and Jira-specific error handling
 * deliberately remain with the caller.
 */
export function createBoardCachePolicy<T>({
  freshForMs,
  staleForMs,
  now = Date.now,
  maxEntries = 1000,
}: BoardCachePolicyOptions) {
  // No `ttl`: fresh/stale/expired is computed from the injected clock.
  const entries = new LRUCache<string, BoardCacheEntry<T>>({ max: maxEntries });
  const inFlight = new Map<string, Promise<T>>();
  const background = new Map<string, Promise<unknown>>();

  function read(key: string, at = now()): BoardCacheRead<T> {
    const entry = entries.get(key);
    if (!entry) return { state: "missing", entry: null };
    if (at < entry.expiresAt) return { state: "fresh", entry };
    if (at < entry.staleUntil) return { state: "stale", entry };
    return { state: "expired", entry };
  }

  function write(key: string, data: T, options: WriteOptions = {}): BoardCacheEntry<T> {
    const writtenAt = options.now ?? now();
    const entry = {
      data,
      expiresAt: writtenAt + (options.freshForMs ?? freshForMs),
      staleUntil: writtenAt + (options.staleForMs ?? staleForMs),
    };
    entries.set(key, entry);
    return entry;
  }

  function getInFlight(key: string): Promise<T> | undefined {
    return inFlight.get(key);
  }

  function release(map: Map<string, Promise<unknown>>, key: string, request: Promise<unknown>) {
    void request
      .finally(() => {
        if (map.get(key) === request) map.delete(key);
      })
      .catch(() => undefined);
  }

  function track(key: string, request: Promise<T>): void {
    inFlight.set(key, request);
    release(inFlight, key, request);
  }

  function trackBackground(key: string, request: Promise<unknown>): void {
    background.set(key, request);
    release(background, key, request);
  }

  function clear(): void {
    entries.clear();
    inFlight.clear();
    background.clear();
  }

  return {
    read,
    write,
    delete: (key: string) => entries.delete(key),
    clear,
    hasInFlight: (key: string) => inFlight.has(key) || background.has(key),
    getInFlight,
    track,
    trackBackground,
  };
}
