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
}: BoardCachePolicyOptions) {
  const entries = new Map<string, BoardCacheEntry<T>>();
  const inFlight = new Map<string, Promise<T> | Promise<void>>();

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
    // Background membership refreshes currently resolve void. Keep the shared
    // registry behavior until F-005 is handled in its dedicated bug batch.
    return inFlight.get(key) as Promise<T> | undefined;
  }

  function track(key: string, request: Promise<T> | Promise<void>): void {
    inFlight.set(key, request);
    void request.finally(() => {
      inFlight.delete(key);
    }).catch(() => undefined);
  }

  function clear(): void {
    entries.clear();
    inFlight.clear();
  }

  return {
    read,
    write,
    delete: (key: string) => entries.delete(key),
    clear,
    hasInFlight: (key: string) => inFlight.has(key),
    getInFlight,
    track,
  };
}
