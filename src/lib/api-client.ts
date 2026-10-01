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

/**
 * Normalize an unknown thrown value into a safe, display-ready message.
 *
 * Keeps structured `ApiError`s intact (they already carry a server-provided
 * message) and falls back to a neutral string for anything else (null, an object,
 * a plain string, ...). Centralizing this here means error display does not depend
 * on the error being an `Error` instance and never renders a raw `[object Object]`.
 */
export function getErrorMessage(error: unknown, fallback = "Đã xảy ra lỗi"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim() !== "") return error;
  return fallback;
}
