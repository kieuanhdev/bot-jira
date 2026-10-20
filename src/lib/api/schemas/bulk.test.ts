import { describe, expect, it } from "vitest";
import { BulkCreateEnvelopeSchema, BulkRetryBodySchema, BulkRetryBranchBodySchema } from "./bulk";

describe("BulkRetryBodySchema", () => {
  it("accepts an empty object and a list of item ids", () => {
    expect(BulkRetryBodySchema.safeParse({}).success).toBe(true);
    expect(BulkRetryBodySchema.safeParse({ itemIds: ["a"] }).success).toBe(true);
  });
  it("rejects a non-array itemIds", () => {
    expect(BulkRetryBodySchema.safeParse({ itemIds: "a" }).success).toBe(false);
  });
});

describe("BulkRetryBranchBodySchema", () => {
  it("accepts a clientRef", () => {
    expect(BulkRetryBranchBodySchema.safeParse({ clientRef: "r1" }).success).toBe(true);
  });
  it("rejects a non-string clientRef", () => {
    expect(BulkRetryBranchBodySchema.safeParse({ clientRef: 1 }).success).toBe(false);
  });
});

describe("BulkCreateEnvelopeSchema", () => {
  it("keeps unknown keys so the preview receives the whole body", () => {
    const r = BulkCreateEnvelopeSchema.safeParse({ projectKey: "EPM", items: [{ summary: "x" }], source: { type: "x" } });
    expect(r.success && r.data).toMatchObject({ projectKey: "EPM", items: [{ summary: "x" }] });
  });
  it("rejects a non-boolean confirm", () => {
    expect(BulkCreateEnvelopeSchema.safeParse({ confirm: "yes" }).success).toBe(false);
  });
});
