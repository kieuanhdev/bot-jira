import { describe, expect, it } from "vitest";
import { AdminProjectSyncBodySchema, OutboxRetryBodySchema, ReportSnapshotBodySchema } from "./admin";

describe("OutboxRetryBodySchema", () => {
  it("accepts ids and an empty object", () => {
    expect(OutboxRetryBodySchema.safeParse({ ids: ["a"] }).success).toBe(true);
    expect(OutboxRetryBodySchema.safeParse({}).success).toBe(true);
  });
  it("rejects non-string ids", () => {
    expect(OutboxRetryBodySchema.safeParse({ ids: [1] }).success).toBe(false);
  });
});

describe("AdminProjectSyncBodySchema", () => {
  it("accepts a preset body and leaves preset/features/keys to the route", () => {
    const r = AdminProjectSyncBodySchema.safeParse({ keys: ["EPM"], preset: "x", features: { a: 1 } });
    expect(r.success).toBe(true);
  });
  it("rejects a non-boolean syncEnabled", () => {
    expect(AdminProjectSyncBodySchema.safeParse({ syncEnabled: "on" }).success).toBe(false);
  });
});

describe("ReportSnapshotBodySchema", () => {
  it("accepts an empty object and a full body", () => {
    expect(ReportSnapshotBodySchema.safeParse({}).success).toBe(true);
    expect(ReportSnapshotBodySchema.safeParse({ projectKey: "EPM", targetDate: "2026-10-01", timezone: "UTC" }).success).toBe(true);
  });
  it("rejects a non-string projectKey", () => {
    expect(ReportSnapshotBodySchema.safeParse({ projectKey: 1 }).success).toBe(false);
  });
});
