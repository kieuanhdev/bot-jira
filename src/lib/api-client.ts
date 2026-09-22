// Tiny typed fetch helper for client components.
/**
 * Error thrown when a request is not OK. Carries the HTTP `status` so callers
 * can distinguish e.g. a 403 (permission denied) from a 502 (upstream/Jira
 * failure) instead of only reading an opaque message.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
    revalidate?: boolean | number;
  } = {}
): Promise<T> {
  const { method = "GET", body, revalidate } = options;
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache:
      revalidate === true
        ? "no-store"
        : typeof revalidate === "number"
          ? "force-cache"
          : "no-store",
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
