import { describe, expect, it } from "vitest";
import {
  CreateReleaseBodySchema,
  ReleaseApprovalBodySchema,
  ReleaseMetadataBodySchema,
  ReleaseOverrideBodySchema,
} from "./releases";

describe("ReleaseMetadataBodySchema", () => {
  it("accepts notes", () => {
    expect(ReleaseMetadataBodySchema.safeParse({ notes: "n" }).success).toBe(true);
  });
  it("rejects a non-string description", () => {
    expect(ReleaseMetadataBodySchema.safeParse({ description: 1 }).success).toBe(false);
  });
});

describe("ReleaseApprovalBodySchema", () => {
  it("accepts a type and note", () => {
    expect(ReleaseApprovalBodySchema.safeParse({ type: "qa", note: "ok" }).success).toBe(true);
  });
  it("rejects a non-string note", () => {
    expect(ReleaseApprovalBodySchema.safeParse({ note: 1 }).success).toBe(false);
  });
});

describe("ReleaseOverrideBodySchema", () => {
  it("accepts gate and reason", () => {
    expect(ReleaseOverrideBodySchema.safeParse({ gate: "g", reason: "r" }).success).toBe(true);
  });
  it("rejects a non-string gate", () => {
    expect(ReleaseOverrideBodySchema.safeParse({ gate: 1 }).success).toBe(false);
  });
});

describe("CreateReleaseBodySchema", () => {
  it("defaults a missing version to an empty string", () => {
    const r = CreateReleaseBodySchema.safeParse({ projectKey: "ABC" });
    expect(r.success && r.data.version).toBe("");
  });
  it("rejects a non-string version", () => {
    expect(CreateReleaseBodySchema.safeParse({ version: 1 }).success).toBe(false);
  });
});
