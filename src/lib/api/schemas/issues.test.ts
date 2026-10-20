import { describe, expect, it } from "vitest";
import { IssueCommentBodySchema, IssueTransitionBodySchema } from "./issues";

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
