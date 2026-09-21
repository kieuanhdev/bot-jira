// Tiny typed fetch helper for client components.
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
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
