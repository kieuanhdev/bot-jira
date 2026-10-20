import { describe, expect, it } from "vitest";
import { NotifyDeleteBodySchema, NotifyMarkReadBodySchema, NotifyPreferencesBodySchema } from "./notify";

describe("NotifyDeleteBodySchema", () => {
  it("accepts ids", () => {
    expect(NotifyDeleteBodySchema.safeParse({ ids: ["a"] }).success).toBe(true);
  });
  it("rejects non-array ids", () => {
    expect(NotifyDeleteBodySchema.safeParse({ ids: "a" }).success).toBe(false);
  });
});

describe("NotifyMarkReadBodySchema", () => {
  it("accepts all with before", () => {
    expect(NotifyMarkReadBodySchema.safeParse({ all: true, before: "2026-01-01" }).success).toBe(true);
  });
  it("rejects a non-boolean unread", () => {
    expect(NotifyMarkReadBodySchema.safeParse({ unread: "yes" }).success).toBe(false);
  });
});

describe("NotifyPreferencesBodySchema", () => {
  it("accepts a full body", () => {
    const r = NotifyPreferencesBodySchema.safeParse({
      disabledTypes: ["comment"],
      pushEnabled: true,
      deliveryMode: "digest",
      digestHour: 9,
    });
    expect(r.success).toBe(true);
  });
  it("rejects a non-array disabledTypes and an unknown deliveryMode", () => {
    expect(NotifyPreferencesBodySchema.safeParse({ disabledTypes: "x" }).success).toBe(false);
    expect(NotifyPreferencesBodySchema.safeParse({ deliveryMode: "weekly" }).success).toBe(false);
  });
});
