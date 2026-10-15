import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchWithTimeout,
  HttpTimeoutError,
  parseRetryAfterHeader,
  shouldRetryStatus,
  withRetry,
} from "./fetch-with-timeout";

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves successfully when fetch completes before timeout", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

    const resPromise = fetchWithTimeout("https://example.com/api", {
      timeoutMs: 1000,
    });
    await expect(resPromise).resolves.toBe(mockResponse);
  });

  it("aborts and throws HttpTimeoutError when fetch hangs past timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          })
      )
    );

    const resPromise = fetchWithTimeout("https://example.com/slow", {
      timeoutMs: 500,
    });

    const assertion = expect(resPromise).rejects.toThrow(HttpTimeoutError);
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });

  it("propagates caller abort signal when aborted before timeout", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Cancelled by caller", "AbortError"));
            });
          })
      )
    );

    const resPromise = fetchWithTimeout("https://example.com/api", {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    controller.abort();
    await expect(resPromise).rejects.toMatchObject({
      name: "AbortError",
      message: "Cancelled by caller",
    });
  });
});

describe("shouldRetryStatus", () => {
  it("returns true for 429, 502, 503, 504", () => {
    expect(shouldRetryStatus(429)).toBe(true);
    expect(shouldRetryStatus(502)).toBe(true);
    expect(shouldRetryStatus(503)).toBe(true);
    expect(shouldRetryStatus(504)).toBe(true);
  });

  it("returns false for other statuses (200, 400, 401, 403, 404, 500)", () => {
    expect(shouldRetryStatus(200)).toBe(false);
    expect(shouldRetryStatus(400)).toBe(false);
    expect(shouldRetryStatus(401)).toBe(false);
    expect(shouldRetryStatus(403)).toBe(false);
    expect(shouldRetryStatus(404)).toBe(false);
    expect(shouldRetryStatus(500)).toBe(false);
  });
});

describe("parseRetryAfterHeader", () => {
  it("parses numeric delta seconds", () => {
    expect(parseRetryAfterHeader("5")).toBe(5000);
    expect(parseRetryAfterHeader("0")).toBe(0);
  });

  it("parses HTTP date string", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const parsed = parseRetryAfterHeader(future);
    expect(parsed).toBeGreaterThanOrEqual(9000);
    expect(parsed).toBeLessThanOrEqual(11000);
  });

  it("returns null for invalid or null inputs", () => {
    expect(parseRetryAfterHeader(null)).toBeNull();
    expect(parseRetryAfterHeader("")).toBeNull();
    expect(parseRetryAfterHeader("invalid-date")).toBeNull();
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, {
      retries: 2,
      baseDelayMs: 100,
      retryOn: () => false,
      sleep,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries up to specified retry count when retryOn returns true for error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient error 1"))
      .mockRejectedValueOnce(new Error("transient error 2"))
      .mockResolvedValue("recovered");
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry(fn, {
      retries: 2,
      baseDelayMs: 100,
      retryOn: (err) => Boolean(err),
      sleep,
    });

    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries when retryOn returns true for response result (e.g. 503 response)", async () => {
    const res503 = new Response("unavailable", { status: 503 });
    const res200 = new Response("ok", { status: 200 });

    const fn = vi
      .fn()
      .mockResolvedValueOnce(res503)
      .mockResolvedValueOnce(res200);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await withRetry<Response>(fn, {
      retries: 2,
      baseDelayMs: 100,
      retryOn: (_err, res) => res?.status === 503,
      sleep,
    });

    expect(result).toBe(res200);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After header from response when available", async () => {
    const res429 = new Response("rate limited", {
      status: 429,
      headers: { "retry-after": "3" },
    });
    const res200 = new Response("ok", { status: 200 });

    const fn = vi
      .fn()
      .mockResolvedValueOnce(res429)
      .mockResolvedValueOnce(res200);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await withRetry<Response>(fn, {
      retries: 2,
      baseDelayMs: 100,
      retryOn: (_err, res) => res?.status === 429,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("throws error when retries are exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent error"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      withRetry(fn, {
        retries: 2,
        baseDelayMs: 50,
        retryOn: () => true,
        sleep,
      })
    ).rejects.toThrow("permanent error");

    expect(fn).toHaveBeenCalledTimes(3); // attempt 1 + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
