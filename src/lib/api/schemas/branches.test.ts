import { describe, expect, it } from "vitest";
import { BranchLinkBodySchema, BranchPullRequestsBodySchema } from "./branches";

describe("BranchLinkBodySchema", () => {
  it("keeps a null jiraKey distinct from a missing one", () => {
    const withNull = BranchLinkBodySchema.safeParse({ jiraKey: null });
    expect(withNull.success && withNull.data.jiraKey).toBeNull();
    const missing = BranchLinkBodySchema.safeParse({ action: "confirm" });
    expect(missing.success && missing.data.jiraKey).toBeUndefined();
  });
  it("rejects non-string ids entries", () => {
    expect(BranchLinkBodySchema.safeParse({ action: "link_many", ids: [1] }).success).toBe(false);
  });
});

describe("BranchPullRequestsBodySchema", () => {
  it("accepts a plan request", () => {
    const r = BranchPullRequestsBodySchema.safeParse({
      jiraKey: "ABC-1",
      branchIds: ["b"],
      targets: { b: "main" },
      dryRun: true,
    });
    expect(r.success).toBe(true);
  });
  it("rejects a non-boolean dryRun", () => {
    expect(BranchPullRequestsBodySchema.safeParse({ dryRun: "yes" }).success).toBe(false);
  });
});
