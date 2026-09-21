import type { Blocker, BranchInfoRow, GateResult } from "./types";

/**
 * pull_requests — every PR must be MERGED into the base branch.
 *
 * - `CLOSED` / `DECLINED` are `failed` (not merged).
 * - `OPEN` is `unknown` (in flight — cannot confirm it will merge).
 * - Any branch whose PR data is missing (`prState == null`) is `unknown`
 *   (no PR data available to verify).
 * - A fresh `MERGED` PR passes.
 */
export function pullRequestsGate(branchInfos: BranchInfoRow[]): GateResult {
  const hasPr = branchInfos.some((b) => b.prState != null);
  if (!hasPr) {
    // No branch has any PR data at all — cannot verify.
    return {
      gate: "pull_requests",
      state: "unknown",
      summary: "No pull-request data available",
      blockers: branchInfos.map((b) => ({
        source: "bitbucket",
        reason: `branch ${b.repo}:${b.branch} has no PR data`,
      })),
    };
  }

  const failed: Blocker[] = [];
  const unknown: Blocker[] = [];
  let merged = 0;

  for (const b of branchInfos) {
    const state = (b.prState ?? "").toUpperCase();
    if (state === "MERGED") {
      merged++;
    } else if (state === "CLOSED" || state === "DECLINED") {
      failed.push({
        source: "bitbucket",
        reason: `PR for ${b.repo}:${b.branch} is ${b.prState}`,
      });
    } else if (state === "OPEN") {
      unknown.push({
        source: "bitbucket",
        reason: `PR for ${b.repo}:${b.branch} is still OPEN`,
      });
    } else if (b.prState == null) {
      unknown.push({
        source: "bitbucket",
        reason: `branch ${b.repo}:${b.branch} has no PR state`,
      });
    } else {
      // Unrecognized state — treat as unverifiable.
      unknown.push({
        source: "bitbucket",
        reason: `PR for ${b.repo}:${b.branch} in unexpected state ${b.prState}`,
      });
    }
  }

  if (failed.length > 0) {
    return {
      gate: "pull_requests",
      state: "failed",
      summary: `${failed.length} PR(s) closed/declined (not merged)`,
      blockers: failed,
      details: { merged },
    };
  }
  if (unknown.length > 0) {
    return {
      gate: "pull_requests",
      state: "unknown",
      summary: `${unknown.length} PR(s) not yet merged into base branch`,
      blockers: unknown,
      details: { merged },
    };
  }
  return {
    gate: "pull_requests",
    state: "passed",
    summary: `All ${merged} PR(s) merged into base branch`,
    blockers: [],
    details: { merged },
  };
}
