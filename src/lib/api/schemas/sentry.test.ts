import { describe, expect, it } from "vitest";
import {
  SentryBulkCreateBodySchema,
  SentryCreateBodySchema,
  SentryQuerySchema,
  SentryRetryBodySchema,
  SentryReviewBodySchema,
} from "./sentry";

describe("SentryCreateBodySchema", () => {
  it("accepts a row and keeps it", () => {
    const r = SentryCreateBodySchema.safeParse({ row: { summary: "s" }, extra: 1 });
    expect(r.success && r.data.row).toEqual({ summary: "s" });
  });
  it("rejects a non-string operationId", () => {
    expect(SentryCreateBodySchema.safeParse({ confirm: true, operationId: 5 }).success).toBe(false);
  });
});

describe("SentryReviewBodySchema", () => {
  it("drops non-string and empty ids and caps at 100", () => {
    const ids = [1, "", "a", ...Array.from({ length: 150 }, (_, i) => `id${i}`)];
    const r = SentryReviewBodySchema.safeParse({ ids, decision: "reject" });
    expect(r.success && r.data.ids).toHaveLength(100);
    expect(r.success && r.data.ids[0]).toBe("a");
  });
  it("treats a non-array ids as empty", () => {
    const r = SentryReviewBodySchema.safeParse({ ids: "a" });
    expect(r.success && r.data.ids).toEqual([]);
  });
  it("rejects a non-object body", () => {
    expect(SentryReviewBodySchema.safeParse([]).success).toBe(false);
  });
});

describe("SentryRetryBodySchema", () => {
  it("accepts an id", () => {
    expect(SentryRetryBodySchema.safeParse({ id: "x" }).success).toBe(true);
  });
  it("rejects a non-string id", () => {
    expect(SentryRetryBodySchema.safeParse({ id: 1 }).success).toBe(false);
  });
});

describe("SentryBulkCreateBodySchema", () => {
  it("accepts a preview body", () => {
    expect(SentryBulkCreateBodySchema.safeParse({ ids: ["a"] }).success).toBe(true);
  });
  it("rejects a non-boolean confirm", () => {
    expect(SentryBulkCreateBodySchema.safeParse({ confirm: 1 }).success).toBe(false);
  });
});

describe("SentryQuerySchema", () => {
  it("accepts valid q and sort", () => {
    const r = SentryQuerySchema.safeParse({ q: "  crash error  ", sort: "events" });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ q: "crash error", sort: "events" });

    const rHot = SentryQuerySchema.safeParse({ sort: "hot" });
    expect(rHot.success).toBe(true);
    expect(rHot.data).toEqual({ q: undefined, sort: "hot" });
  });

  it("normalizes empty or whitespace q to undefined", () => {
    const r = SentryQuerySchema.safeParse({ q: "   ", sort: "recent" });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ q: undefined, sort: "recent" });
  });

  it("ignores q when over 100 characters", () => {
    const r = SentryQuerySchema.safeParse({ q: "a".repeat(101), sort: "first" });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ q: undefined, sort: "first" });
  });

  it("ignores invalid sort and falls back to undefined", () => {
    const r = SentryQuerySchema.safeParse({ q: "test", sort: "invalid" });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ q: "test", sort: undefined });
  });

  it("handles empty object", () => {
    const r = SentryQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ q: undefined, sort: undefined });
  });
});

