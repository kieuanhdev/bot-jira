import type { Blocker, GateResult } from "./types";

// REL-04 — CI gate.
//
// Reads the latest CI build state for the release's relevant commit(s) from the
// CiBuildStatus read model. Fail-safe mapping (plan §REL-04):
//   - success (build+test) on the checked commit      -> passed
//   - failed                                           -> failed
//   - pending / no build / build on a different commit -> unknown
// The gate is mandatory and CANNOT be overridden (NON_OVERRIDABLE set in index).

export type CiBuildState = {
  provider: string;
  commitSha: string;
  status: string; // normalized: pending | success | failed | cancelled
  testStatus: string | null;
  url: string | null;
  completedAt: Date | null;
  /** The commit the release expects to be checked against (from the PR/branch). */
  expectedCommitSha: string | null;
};

function isFailedBuild(b: CiBuildState): boolean {
  return b.status === "failed" || (b.testStatus ? /fail|error/i.test(b.testStatus) : false);
}

function isPassedBuild(b: CiBuildState): boolean {
  return b.status === "success" && (!b.testStatus || /pass|ok|success/i.test(b.testStatus));
}

export function ciGate(builds: CiBuildState[]): GateResult {
  // No CI data at all => unknown (cannot verify).
  if (builds.length === 0) {
    return {
      gate: "ci",
      state: "unknown",
      summary: "No CI build recorded for this release",
      blockers: [{ source: "ci", reason: "no CI build recorded" }],
    };
  }

  const blockers: Blocker[] = [];
  let hasPending = false;
  let hasStaleCommit = false;
  let hasFailed = false;
  let hasPassedOnExpected = false;

  for (const b of builds) {
    const url = b.url ? { url: b.url } : {};
    // A build on a commit we don't expect is stale evidence -> unknown.
    if (b.expectedCommitSha && b.commitSha && b.commitSha !== b.expectedCommitSha) {
      hasStaleCommit = true;
      blockers.push({
        source: "ci",
        reason: `build on commit ${b.commitSha.slice(0, 8)} does not match expected ${b.expectedCommitSha.slice(0, 8)}`,
        ...url,
      });
      continue;
    }
    if (isFailedBuild(b)) {
      hasFailed = true;
      blockers.push({ source: "ci", reason: `CI build ${b.status} on ${b.commitSha.slice(0, 8)}`, ...url });
    } else if (b.status === "pending") {
      hasPending = true;
      blockers.push({ source: "ci", reason: `CI build still pending on ${b.commitSha.slice(0, 8)}`, ...url });
    } else if (isPassedBuild(b)) {
      hasPassedOnExpected = true;
    }
  }

  // Precedence: failed > stale/missing match > pending > passed.
  if (hasFailed) {
    return { gate: "ci", state: "failed", summary: "CI build failed", blockers };
  }
  if (hasStaleCommit) {
    return { gate: "ci", state: "unknown", summary: "CI build does not match the release commit", blockers };
  }
  if (hasPending) {
    return { gate: "ci", state: "unknown", summary: "CI build still running", blockers };
  }
  if (hasPassedOnExpected) {
    return { gate: "ci", state: "passed", summary: "CI build succeeded on the release commit", blockers: [] };
  }
  // Build present but not a clear pass on the expected commit.
  return { gate: "ci", state: "unknown", summary: "CI state inconclusive", blockers };
}
