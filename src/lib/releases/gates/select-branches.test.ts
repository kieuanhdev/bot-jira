import { describe, it, expect } from "vitest";
import { selectReleaseBranches } from "./index";
import type { BranchInfoRow } from "./types";

function b(branch: string, prState: string | null = null): BranchInfoRow {
  return {
    repo: "team/app",
    branch,
    prState,
    prDestinationBranch: "main",
    merged: false,
    checkedAt: new Date("2026-09-21T00:00:00Z"),
  };
}

describe("selectReleaseBranches (M3-01/M3-03 branch scoping)", () => {
  it("keeps branches whose name contains a release issue key", () => {
    const rows = [b("feature/EPM-1-fix"), b("feature/OTHER-999"), b("hotfix/EPM-2")];
    const out = selectReleaseBranches(rows, ["EPM-1", "EPM-2"]);
    expect(out.map((r) => r.branch)).toEqual(["feature/EPM-1-fix", "hotfix/EPM-2"]);
  });

  it("does not match partial issue keys (EPM-1 != EPM-10)", () => {
    const rows = [b("feature/EPM-10")];
    expect(selectReleaseBranches(rows, ["EPM-1"])).toEqual([]);
  });

  it("returns empty for an empty branch set", () => {
    expect(selectReleaseBranches([], ["EPM-1"])).toEqual([]);
  });

  it("returns all branches when there are no issue keys to scope by", () => {
    const rows = [b("a"), b("b")];
    expect(selectReleaseBranches(rows, [])).toEqual(rows);
  });

  it("matches case-insensitively", () => {
    const rows = [b("Feature/epm-1")];
    expect(selectReleaseBranches(rows, ["EPM-1"])).toHaveLength(1);
  });
});
