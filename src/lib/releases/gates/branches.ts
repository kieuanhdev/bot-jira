import type { Blocker, BranchInfoRow, GateResult } from "./types";

/**
 * branches — every branch associated with the release should have a pull
 * request. A branch with no PR is a `failed` blocker (per release policy
 * "Task needs code but has no branch/PR").
 */
export function branchesGate(branchInfos: BranchInfoRow[]): GateResult {
  const withoutPr: Blocker[] = branchInfos
    .filter((b) => b.prState == null)
    .map((b) => ({
      source: "bitbucket",
      reason: `branch ${b.repo}:${b.branch} has no pull request`,
    }));

  if (withoutPr.length > 0) {
    return {
      gate: "branches",
      state: "failed",
      summary: `${withoutPr.length} branch(es) without a pull request`,
      blockers: withoutPr,
    };
  }
  return {
    gate: "branches",
    state: "passed",
    summary:
      branchInfos.length > 0
        ? `All ${branchInfos.length} branch(es) have a pull request`
        : "No associated branches",
    blockers: [],
  };
}
