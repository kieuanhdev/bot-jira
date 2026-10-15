/**
 * Shared HTTP fetch with timeout and bounded retry primitive.
 */

export class HttpTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly url: string;

  constructor(message: string, timeoutMs: number, url: string) {
    super(message);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}

export interface FetchWithTimeoutInit extends RequestInit {
  timeoutMs: number;
}

/**
 * Fetch with an explicit timeout.
 * Aborts when `timeoutMs` expires and rethrows a typed `HttpTimeoutError`.
 * If caller provided `signal` is aborted, propagates the caller's abort.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: FetchWithTimeoutInit
): Promise<Response> {
  const { timeoutMs, signal: callerSignal, ...restInit } = init;
  const urlStr = typeof input === "string" ? input : input.toString();

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);

  const abortListener = () => {
    controller.abort(callerSignal?.reason ?? new DOMException("This operation was aborted", "AbortError"));
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeoutId);
      throw callerSignal.reason ?? new DOMException("This operation was aborted", "AbortError");
    }
    callerSignal.addEventListener("abort", abortListener, { once: true });
  }

  try {
    const response = await fetch(input, {
      ...restInit,
      signal: controller.signal,
    });
    return response;
  } catch (err: unknown) {
    if (timedOut) {
      throw new HttpTimeoutError(
        `Request to ${urlStr} timed out after ${timeoutMs}ms`,
        timeoutMs,
        urlStr
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (callerSignal) {
      callerSignal.removeEventListener("abort", abortListener);
    }
  }
}

/**
 * Returns true if an HTTP status code is retryable (429, 502, 503, 504).
 */
export function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Parses standard Retry-After header (delta seconds or HTTP date) to milliseconds.
 */
export function parseRetryAfterHeader(value: string | null | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export interface RetryOptions<T> {
  retries: number;
  baseDelayMs: number;
  retryOn: (err: unknown, result?: T) => boolean;
  sleep?: (ms: number) => Promise<void>;
  getDelayMs?: (err: unknown, result: T | undefined, defaultDelayMs: number) => number;
}

/**
 * Bounded jittered exponential retry utility.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions<T>
): Promise<T> {
  const {
    retries,
    baseDelayMs,
    retryOn,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    getDelayMs,
  } = opts;

  let attempt = 1;

  while (true) {
    try {
      const result = await fn(attempt);
      if (attempt <= retries && retryOn(undefined, result)) {
        let delay = Math.round(
          baseDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)
        );

        if (
          result &&
          typeof (result as { headers?: { get?: (k: string) => string | null } }).headers?.get ===
            "function"
        ) {
          const retryAfter = parseRetryAfterHeader(
            (result as unknown as Response).headers.get("retry-after")
          );
          if (retryAfter !== null && retryAfter >= 0) {
            delay = retryAfter;
          }
        }

        if (getDelayMs) {
          delay = getDelayMs(undefined, result, delay);
        }

        await sleep(delay);
        attempt++;
        continue;
      }
      return result;
    } catch (err: unknown) {
      if (attempt <= retries && retryOn(err, undefined)) {
        let delay = Math.round(
          baseDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)
        );

        if (getDelayMs) {
          delay = getDelayMs(err, undefined, delay);
        }

        await sleep(delay);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}
