import { describe, it, expect } from "vitest";
import { ciGate, type CiBuildState } from "./gates/ci";

function build(overrides: Partial<CiBuildState> = {}): CiBuildState {
  return {
    provider: "ci",
    commitSha: "abc123",
    status: "success",
    testStatus: null,
    url: null,
    completedAt: null,
    expectedCommitSha: "abc123",
    ...overrides,
  };
}

describe("ciGate (REL-04)", () => {
  it("is unknown when there is no CI data", () => {
    expect(ciGate([]).state).toBe("unknown");
  });

  it("passes on a successful build on the expected commit", () => {
    expect(ciGate([build()]).state).toBe("passed");
  });

  it("fails on a failed build", () => {
    expect(ciGate([build({ status: "failed" })]).state).toBe("failed");
  });

  it("fails when the test status indicates failure", () => {
    expect(ciGate([build({ status: "success", testStatus: "1 failing" })]).state).toBe("failed");
  });

  it("is unknown while a build is pending", () => {
    expect(ciGate([build({ status: "pending" })]).state).toBe("unknown");
  });

  it("is unknown when the build is on a different commit than expected", () => {
    expect(ciGate([build({ commitSha: "def456", expectedCommitSha: "abc123" })]).state).toBe("unknown");
  });

  it("takes precedence: failed beats pending", () => {
    const g = ciGate([build({ status: "pending" }), build({ status: "failed" })]);
    expect(g.state).toBe("failed");
  });
});
