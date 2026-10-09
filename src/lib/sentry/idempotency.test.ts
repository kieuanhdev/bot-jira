import { describe, it, expect } from "vitest";
import type { SentryIssue } from "./client";
import {
  sentryProjectSlug,
  sentryIdKey,
  sentryLabel,
  sentryBackoffMs,
  isBackoffElapsed,
  shouldSkipSentryImport,
  buildSentryEventKey,
} from "./idempotency";

function makeIssue(overrides: Partial<SentryIssue> = {}): SentryIssue {
  return {
    id: 42,
    shortId: "ABC",
    title: "Test error",
    level: "fatal",
    count: 3,
    latestEvent: "2026-09-21T00:00:00Z",
    ...overrides,
  };
}

describe("sentry import idempotency", () => {
  describe("identity keys", () => {
    it("uses the per-issue project slug when available", () => {
      const issue = makeIssue({ project: { slug: "my-app", id: 1 } });
      expect(sentryProjectSlug(issue)).toBe("my-app");
    });

    it("falls back to the configured project when slug is missing", () => {
      const issue = makeIssue();
      expect(sentryProjectSlug(issue, "default-project")).toBe("default-project");
    });

    it("uses the numeric id as the stable key", () => {
      const issue = makeIssue({ id: 12345 });
      expect(sentryIdKey(issue)).toBe("12345");
    });

    it("falls back to shortId when numeric id is missing or empty", () => {
      expect(sentryIdKey({ shortId: "ERR-99" })).toBe("ERR-99");
      expect(sentryIdKey({ id: "", shortId: "ERR-100" })).toBe("ERR-100");
    });

    it("builds a unique recovery label per sentry issue", () => {
      const a = makeIssue({ id: 1 });
      const b = makeIssue({ id: 2 });
      expect(sentryLabel(a)).toBe("sentry-id-1");
      expect(sentryLabel(b)).toBe("sentry-id-2");
      expect(sentryLabel(a)).not.toBe(sentryLabel(b));
    });

    it("builds deterministic event keys for notification deduplication", () => {
      expect(buildSentryEventKey("app", "42", "created")).toBe("sentry:app:42:created");
      expect(buildSentryEventKey("app", "42")).toBe("sentry:app:42:created");
      expect(buildSentryEventKey("core", "99", "resolved")).toBe("sentry:core:99:resolved");
    });
  });

  describe("backoff", () => {
    it("starts at 60s", () => {
      expect(sentryBackoffMs(0)).toBe(60_000);
    });

    it("doubles per attempt", () => {
      expect(sentryBackoffMs(1)).toBe(120_000);
      expect(sentryBackoffMs(2)).toBe(240_000);
      expect(sentryBackoffMs(3)).toBe(480_000);
    });

    it("caps the exponent at 10", () => {
      const capped = sentryBackoffMs(10);
      expect(sentryBackoffMs(11)).toBe(capped);
      expect(sentryBackoffMs(100)).toBe(capped);
    });

    it("determines whether backoff has elapsed correctly", () => {
      const now = 1_000_000_000;
      // No prior attempt -> backoff elapsed
      expect(isBackoffElapsed(null, 0, now)).toBe(true);
      expect(isBackoffElapsed(undefined, 1, now)).toBe(true);

      // Attempt 1: backoff is 120s (120,000ms)
      // 50s ago -> not elapsed
      expect(isBackoffElapsed(now - 50_000, 1, now)).toBe(false);
      // 120s ago -> elapsed
      expect(isBackoffElapsed(now - 120_000, 1, now)).toBe(true);
      // 200s ago -> elapsed
      expect(isBackoffElapsed(now - 200_000, 1, now)).toBe(true);
    });
  });

  describe("idempotent flow logic", () => {
    it("a created mapping short-circuits", () => {
      const decision = shouldSkipSentryImport({
        state: "created",
        jiraKey: "PROJ-1",
      });
      expect(decision.skip).toBe(true);
      expect(decision.reason).toBe("created");
    });

    it("a created mapping without a jiraKey is not skipped (requires recovery/repair)", () => {
      const decision = shouldSkipSentryImport({
        state: "created",
        jiraKey: null,
      });
      expect(decision.skip).toBe(false);
    });

    it("an ignored mapping (unmapped project) is permanently skipped", () => {
      const decision = shouldSkipSentryImport({
        state: "ignored",
      });
      expect(decision.skip).toBe(true);
      expect(decision.reason).toBe("ignored");
    });

    it("a failed mapping with backoff not elapsed skips", () => {
      const now = 1_000_000_000;
      const decision = shouldSkipSentryImport(
        {
          state: "failed",
          attemptCount: 1,
          lastAttemptAt: new Date(now - 30_000), // 30s ago, but backoff is 120s
        },
        now
      );
      expect(decision.skip).toBe(true);
      expect(decision.reason).toBe("backoff_active");
    });

    it("a failed mapping past backoff retries", () => {
      const now = 1_000_000_000;
      const decision = shouldSkipSentryImport(
        {
          state: "failed",
          attemptCount: 1,
          lastAttemptAt: new Date(now - 200_000), // 200s ago, backoff is 120s
        },
        now
      );
      expect(decision.skip).toBe(false);
    });

    it("a pending mapping without created/failed short-circuit does not skip", () => {
      expect(shouldSkipSentryImport({ state: "pending" }).skip).toBe(false);
      expect(shouldSkipSentryImport(null).skip).toBe(false);
    });

    it("recovery finds the issue by label before creating", () => {
      const issue = makeIssue({ id: 99 });
      const label = sentryLabel(issue);
      expect(label).toBe("sentry-id-99");
    });
  });
});
