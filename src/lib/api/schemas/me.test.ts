import { describe, expect, it } from "vitest";
import {
  BoardMembershipRefreshBodySchema,
  BoardPreferenceBodySchema,
  BoardProjectsBodySchema,
  CredentialsBodySchema,
} from "./me";

describe("BoardProjectsBodySchema", () => {
  it("accepts a list of keys", () => {
    expect(BoardProjectsBodySchema.safeParse({ projects: ["EPM"] }).success).toBe(true);
  });
  it("rejects a non-array", () => {
    expect(BoardProjectsBodySchema.safeParse({ projects: "EPM" }).success).toBe(false);
  });
});

describe("BoardPreferenceBodySchema", () => {
  it("accepts and coerces boardId", () => {
    const r = BoardPreferenceBodySchema.safeParse({ projectKey: "EPM", boardId: "101" });
    expect(r.success && r.data.boardId).toBe(101);
  });
  it("rejects a non-positive boardId", () => {
    expect(BoardPreferenceBodySchema.safeParse({ projectKey: "EPM", boardId: -5 }).success).toBe(false);
  });
});

describe("BoardMembershipRefreshBodySchema", () => {
  it("accepts a full body", () => {
    expect(
      BoardMembershipRefreshBodySchema.safeParse({ projectKey: "EPM", boardId: 1, reason: "x", force: true })
        .success
    ).toBe(true);
  });
  it("rejects a non-integer boardId", () => {
    expect(BoardMembershipRefreshBodySchema.safeParse({ boardId: 1.5 }).success).toBe(false);
  });
});

describe("CredentialsBodySchema", () => {
  it("accepts tokens and disconnect flags", () => {
    expect(CredentialsBodySchema.safeParse({ jiraToken: "t", jiraAuth: null, disconnectSentry: true }).success).toBe(
      true
    );
  });
  it("rejects a wrong-typed token", () => {
    expect(CredentialsBodySchema.safeParse({ jiraToken: 1 }).success).toBe(false);
  });
});
