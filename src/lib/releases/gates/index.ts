import type { BranchInfoRow } from "./types";

export type {
  GateState,
  Blocker,
  GateResult,
  ReleaseContext,
  TaskInfo,
  BranchInfoRow,
  SentryIssueInfo,
} from "./types";

export { taskStatusGate } from "./task-status";
export { criticalBugsGate } from "./critical-bugs";
export { sentryGate } from "./sentry";
export { branchesGate } from "./branches";
export { pullRequestsGate } from "./pull-requests";
export { dataFreshnessGate } from "./data-freshness";
export { aiAdvisoryGate } from "./ai-advisory";
export { manualApprovalGate } from "./manual-approval";
export { ciGate } from "./ci";
export {
  dependencyVersionConsistencyGate,
  GATE_DEPENDENCY_VERSION_CONSISTENCY,
} from "./dependency-version-consistency";
export {
  dependencyGraphIntegrityGate,
  GATE_DEPENDENCY_GRAPH_INTEGRITY,
} from "./dependency-graph-integrity";
export type { CiBuildState } from "./ci";

export {
  GATE_AI_ADVISORY,
  GATE_NON_EMPTY,
  GATE_CI,
  NON_OVERRIDABLE,
  nonEmptyGate,
  type ReleaseCheckFn,
  type GateOverrideRow,
  type ReleaseGatesEvaluation,
  overrideIsActive,
  runGates,
  aggregateGates,
  collectBlockers,
  evaluateReleaseGates,
} from "./evaluator";

/**
 * Select the branches relevant to a release.
 *
 * `BranchInfo` has no direct link to an issue or release (it is populated from
 * Bitbucket across all repos), so the only signal we can use without a schema
 * change is the branch name. A branch is considered part of the release when
 * its name contains one of the release's issue keys (a common convention, e.g.
 * `PROJ-123-fix` for `PROJ-123`). Matching is case-insensitive and uses word
 * boundaries so `PROJ-1` does not match `PROJ-10`.
 *
 * Fail-safe: if the release has tasks but none of its branches can be mapped,
 * the result is empty, which makes the branch/PR gates report `unknown`
 * (cannot verify) rather than passing on unrelated branches. This is strictly
 * safer than evaluating every branch in the database.
 */
export function selectReleaseBranches(
  branchInfos: BranchInfoRow[],
  jiraKeys: string[]
): BranchInfoRow[] {
  if (branchInfos.length === 0) return [];
  if (jiraKeys.length === 0) return branchInfos;
  const patterns = jiraKeys
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => new RegExp(`(^|[^A-Za-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9]|$)`, "i"));
  if (patterns.length === 0) return branchInfos;
  return branchInfos.filter((b) =>
    patterns.some((re) => re.test(b.branch))
  );
}
