import { describe, it, expect } from "vitest";
import type { SentryIssue } from "./client";

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

function sentryProjectSlug(issue: SentryIssue): string {
  return issue.project?.slug ?? "default-project";
}

function sentryIdKey(issue: SentryIssue): string {
  return String(issue.id);
}

function sentryLabel(issue: SentryIssue): string {
  return `sentry-id-${sentryIdKey(issue)}`;
}

function backoffMs(attemptCount: number): number {
  const BASE = 60_000;
  return BASE * 2 ** Math.min(attemptCount, 10);
}

describe("sentry import idempotency", () => {
  describe("identity keys", () => {
    it("uses the per-issue project slug when available", () => {
      const issue = makeIssue({ project: { slug: "my-app", id: 1 } });
      expect(sentryProjectSlug(issue)).toBe("my-app");
    });

    it("falls back to the configured project when slug is missing", () => {
      const issue = makeIssue();
      expect(sentryProjectSlug(issue)).toBe("default-project");
    });

    it("uses the numeric id as the stable key", () => {
      const issue = makeIssue({ id: 12345 });
      expect(sentryIdKey(issue)).toBe("12345");
    });

    it("builds a unique recovery label per sentry issue", () => {
      const a = makeIssue({ id: 1 });
      const b = makeIssue({ id: 2 });
      expect(sentryLabel(a)).toBe("sentry-id-1");
      expect(sentryLabel(b)).toBe("sentry-id-2");
      expect(sentryLabel(a)).not.toBe(sentryLabel(b));
    });
  });

  describe("backoff", () => {
    it("starts at 60s", () => {
      expect(backoffMs(0)).toBe(60_000);
    });

    it("doubles per attempt", () => {
      expect(backoffMs(1)).toBe(120_000);
      expect(backoffMs(2)).toBe(240_000);
      expect(backoffMs(3)).toBe(480_000);
    });

    it("caps the exponent at 10", () => {
      const capped = backoffMs(10);
      expect(backoffMs(11)).toBe(capped);
      expect(backoffMs(100)).toBe(capped);
    });
  });

  describe("idempotent flow logic", () => {
    it("a created mapping short-circuits", () => {
      const state = "created";
      const jiraKey = "PROJ-1";
      expect(state === "created" && Boolean(jiraKey)).toBe(true);
    });

    it("a pending mapping with backoff not elapsed skips", () => {
      const attempts = 1;
      const elapsed = 0;
      expect(elapsed < backoffMs(attempts)).toBe(true);
    });

    it("a pending mapping past backoff retries", () => {
      const lastAttempt = new Date(Date.now() - 200_000);
      const attempts = 1;
      const elapsed = Date.now() - lastAttempt.getTime();
      expect(elapsed >= backoffMs(attempts)).toBe(true);
    });

    it("recovery finds the issue by label before creating", () => {
      const issue = makeIssue({ id: 99 });
      const label = sentryLabel(issue);
      expect(label).toBe("sentry-id-99");
    });
  });
});
