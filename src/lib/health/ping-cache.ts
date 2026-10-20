interface Entry {
  value: unknown;
  at: number;
}

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

function refresh<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn()
    .then((value) => {
      entries.set(key, { value, at: Date.now() });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, p);
  return p;
}

/**
 * Stale-while-revalidate wrapper for slow external health probes.
 * A fresh entry is returned as is; a stale one is returned immediately while a
 * background refresh runs; only the very first call (or `fresh`) waits on `fn`.
 */
export async function cachedProbe<T>(
  key: string,
  fn: () => Promise<T>,
  options: { ttlMs: number; fresh?: boolean }
): Promise<T> {
  const entry = entries.get(key) as { value: T; at: number } | undefined;
  if (entry && !options.fresh) {
    if (Date.now() - entry.at > options.ttlMs) {
      void refresh(key, fn).catch(() => {});
    }
    return entry.value;
  }
  return refresh(key, fn);
}

export function clearProbeCache(): void {
  entries.clear();
  inFlight.clear();
}
