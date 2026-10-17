import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sentry,
  requestSentry,
  sanitizeSentryErrorMessage,
  getLatestEvent,
  SentryRequestError,
  type SentryIssue,
} from "./client";
import { env } from "@/lib/env";

describe("Sentry client and error sanitization", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("sanitizeSentryErrorMessage", () => {
    it("returns empty string when input is falsy", () => {
      expect(sanitizeSentryErrorMessage("")).toBe("");
    });

    it("redacts Bearer tokens in error strings", () => {
      const raw = "Request failed: Authorization Bearer sntrys_1234567890abcdef12345 was invalid";
      const sanitized = sanitizeSentryErrorMessage(raw);
      expect(sanitized).not.toContain("sntrys_1234567890abcdef12345");
      expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
    });

    it("redacts sensitive query parameters", () => {
      const raw = "Failed to fetch https://sentry.io/api/0/projects/org/proj/issues/?token=secretToken123&auth=myAuthKey";
      const sanitized = sanitizeSentryErrorMessage(raw);
      expect(sanitized).not.toContain("secretToken123");
      expect(sanitized).not.toContain("myAuthKey");
      expect(sanitized).toContain("?token=[REDACTED]");
      expect(sanitized).toContain("&auth=[REDACTED]");
    });

    it("truncates error messages to a maximum of 300 characters", () => {
      const longMsg = "A".repeat(500);
      const sanitized = sanitizeSentryErrorMessage(longMsg);
      expect(sanitized.length).toBe(300);
    });
  });

  describe("requestSentry & sentry methods", () => {
    it("constructs URL and headers properly for requestSentry", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return {
          ok: true,
          json: async () => ({ status: "ok" }),
        };
      });

      const result = await requestSentry<{ status: string }>("custom/endpoint/");

      expect(result).toEqual({ status: "ok" });
      const base = env.sentryBaseUrl.replace(/\/$/, "");
      const expectedPrefix = `${base}/api/0/projects/${encodeURIComponent(env.sentryOrg)}/${encodeURIComponent(env.sentryProject)}/custom/endpoint/`;
      expect(capturedUrl).toBe(expectedPrefix);
      expect(capturedHeaders["Authorization"]).toBe(`Bearer ${env.sentryToken}`);
      expect(capturedHeaders["Accept"]).toBe("application/json");
    });

    it("listUnresolvedIssues formats query and uses specified limit", async () => {
      let capturedUrl = "";
      const fakeIssues: SentryIssue[] = [
        {
          id: 101,
          shortId: "PROJ-101",
          title: "Unhandled TypeError",
          level: "error",
        },
      ];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => fakeIssues,
        };
      });

      const res = await sentry.listUnresolvedIssues(15);
      expect(res).toEqual(fakeIssues);
      expect(capturedUrl).toContain("issues/?query=is%3Aunresolved&limit=15");
      expect(capturedUrl).not.toContain("sort=");
    });

    it("getIssue targets the issue id path", async () => {
      let capturedUrl = "";
      const fakeIssue = {
        id: 42,
        shortId: "PROJ-42",
        title: "Crash on startup",
        body: "Full stack trace",
      };

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => fakeIssue,
        };
      });

      const res = await sentry.getIssue(42);
      expect(res).toEqual(fakeIssue);
      expect(capturedUrl).toContain("/issues/42/");
    });

    it("throws sanitized error on non-ok HTTP response", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          text: async () => "Unauthorized: Bearer secret_sentry_token_value_here",
        };
      });

      await expect(sentry.listUnresolvedIssues(10)).rejects.toThrowError(
        /Sentry issues\/\?.* -> 401: Unauthorized: Bearer \[REDACTED_TOKEN\]/
      );
    });

    it("handles non-ok response when text() rejects", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 500,
          text: async () => {
            throw new Error("Cannot read body");
          },
        };
      });

      await expect(sentry.getIssue(99)).rejects.toThrowError(
        "Sentry issues/99/ -> 500: "
      );
    });

    it("propagates network errors directly", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection refused"));

      await expect(sentry.listUnresolvedIssues(5)).rejects.toThrowError(
        "Network connection refused"
      );
    });

    it("respects custom abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          throw new Error("This operation was aborted");
        }
        return { ok: true, json: async () => [] };
      });

      await expect(
        sentry.listUnresolvedIssues(5, { signal: controller.signal })
      ).rejects.toThrowError("This operation was aborted");
    });
  });
  describe("getLatestEvent", () => {
    const creds = { org: "my org", project: "web", token: "sntrys_FAKEtoken0123456789" };

    it("calls the org-scoped latest event endpoint with the given token", async () => {
      let capturedUrl = "";
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        return { ok: true, json: async () => ({ eventID: "abc" }) };
      });

      await expect(getLatestEvent("4242", creds)).resolves.toEqual({ eventID: "abc" });
      const base = env.sentryBaseUrl.replace(/\/$/, "");
      expect(capturedUrl).toBe(`${base}/api/0/organizations/my%20org/issues/4242/events/latest/`);
      expect(capturedHeaders["Authorization"]).toBe(`Bearer ${creds.token}`);
    });

    it("throws a sanitized error on a non-2xx response", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 403,
        text: async () => "denied for Bearer sntrys_FAKEtoken0123456789",
      }));

      const err = await getLatestEvent("4242", creds).catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("403");
      expect((err as Error).message).not.toContain("sntrys_FAKEtoken0123456789");
      expect(err).toBeInstanceOf(SentryRequestError);
      expect((err as SentryRequestError).status).toBe(403);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to the base-relative issue path when the org-scoped one returns 404", async () => {
      const calls: { url: string; auth?: string }[] = [];
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        calls.push({ url, auth: (init?.headers as Record<string, string>)?.["Authorization"] });
        if (calls.length === 1) return { ok: false, status: 404, text: async () => "" };
        return { ok: true, json: async () => ({ eventID: "fallback" }) };
      });

      await expect(getLatestEvent("4242", creds)).resolves.toEqual({ eventID: "fallback" });
      const base = env.sentryBaseUrl.replace(/\/$/, "");
      expect(calls.map((c) => c.url)).toEqual([
        `${base}/api/0/organizations/my%20org/issues/4242/events/latest/`,
        `${base}/api/0/issues/4242/events/latest/`,
      ]);
      expect(calls[1].auth).toBe(`Bearer ${creds.token}`);
    });

    it("surfaces the fallback's error when both paths fail", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 404,
        text: async () => "",
      }));

      const err = await getLatestEvent("4242", creds).catch((e: Error) => e);
      expect(err).toBeInstanceOf(SentryRequestError);
      expect((err as SentryRequestError).status).toBe(404);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
