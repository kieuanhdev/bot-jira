import { describe, expect, it } from "vitest";
import {
  BranchParamsBodySchema,
  BulkConfirmEnvelopeSchema,
  EstimateDecisionBodySchema,
  IssueChildBodySchema,
  IssueCloneBodySchema,
  IssueCommentBodySchema,
  IssueLinkBodySchema,
  IssuePatchBodySchema,
  IssueTransitionBodySchema,
} from "./issues";

describe("IssueCommentBodySchema", () => {
  it("accepts a string body or no body", () => {
    expect(IssueCommentBodySchema.safeParse({ body: "Hello" }).success).toBe(true);
    expect(IssueCommentBodySchema.safeParse({}).success).toBe(true);
  });

  it("rejects a non-string body", () => {
    expect(IssueCommentBodySchema.safeParse({ body: 123 }).success).toBe(false);
  });
});

describe("IssueTransitionBodySchema", () => {
  it("accepts a string transitionId", () => {
    expect(IssueTransitionBodySchema.safeParse({ transitionId: "31" }).success).toBe(true);
  });

  it("rejects a non-string transitionId", () => {
    expect(IssueTransitionBodySchema.safeParse({ transitionId: 31 }).success).toBe(false);
  });
});

describe("BulkConfirmEnvelopeSchema", () => {
  it("accepts the confirm envelope and keeps unknown keys", () => {
    const parsed = BulkConfirmEnvelopeSchema.parse({
      selector: { mode: "keys", keys: ["EPM-1"] },
      action: { kind: "assign" },
      confirm: true,
      operationId: "op1",
    });
    expect(parsed.selector).toBeDefined();
    expect(parsed.action).toBeDefined();
  });

  it("rejects a non-boolean confirm", () => {
    expect(BulkConfirmEnvelopeSchema.safeParse({ confirm: "yes" }).success).toBe(false);
  });
});

describe("IssueLinkBodySchema", () => {
  it("accepts string fields", () => {
    expect(IssueLinkBodySchema.safeParse({ typeName: "Blocks", direction: "inward", targetKey: "EPM-2" }).success).toBe(true);
  });

  it("rejects a non-string targetKey", () => {
    expect(IssueLinkBodySchema.safeParse({ targetKey: 5 }).success).toBe(false);
  });
});

describe("IssueChildBodySchema", () => {
  it("accepts summary and issueTypeId", () => {
    expect(IssueChildBodySchema.safeParse({ summary: "x", issueTypeId: "10" }).success).toBe(true);
  });

  it("rejects a numeric issueTypeId", () => {
    expect(IssueChildBodySchema.safeParse({ issueTypeId: 10 }).success).toBe(false);
  });
});

describe("IssueCloneBodySchema", () => {
  it("accepts a summary", () => {
    expect(IssueCloneBodySchema.safeParse({ summary: "Copy" }).success).toBe(true);
  });

  it("rejects a non-string summary", () => {
    expect(IssueCloneBodySchema.safeParse({ summary: 1 }).success).toBe(false);
  });
});

describe("EstimateDecisionBodySchema", () => {
  it("accepts a known decision with points", () => {
    expect(EstimateDecisionBodySchema.safeParse({ decision: "edited", points: 3 }).success).toBe(true);
  });

  it("rejects an unknown decision", () => {
    expect(EstimateDecisionBodySchema.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});

describe("BranchParamsBodySchema", () => {
  it("accepts an empty object and typed params", () => {
    expect(BranchParamsBodySchema.safeParse({}).success).toBe(true);
    expect(BranchParamsBodySchema.safeParse({ repo: "team/app", comment: true }).success).toBe(true);
  });

  it("rejects a non-boolean comment", () => {
    expect(BranchParamsBodySchema.safeParse({ comment: "yes" }).success).toBe(false);
  });
});

describe("IssuePatchBodySchema", () => {
  it("accepts nullable clears and typed fields", () => {
    expect(IssuePatchBodySchema.safeParse({ dueDate: null, points: 5, labels: ["a"] }).success).toBe(true);
  });

  it("rejects wrong-typed fields", () => {
    expect(IssuePatchBodySchema.safeParse({ labels: "a" }).success).toBe(false);
  });
});
