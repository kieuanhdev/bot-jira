import type { Blocker, BranchInfoRow, GateResult, ReleaseContext } from "./types";
import { taskStatusGate } from "./task-status";
import { criticalBugsGate } from "./critical-bugs";
import { sentryGate } from "./sentry";
import { branchesGate } from "./branches";
import { pullRequestsGate } from "./pull-requests";
import { dataFreshnessGate } from "./data-freshness";
import { aiAdvisoryGate } from "./ai-advisory";

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

/** Gates that determine release readiness. `ai_advisory` is never mandatory. */
const GATE_AI_ADVISORY = "ai_advisory";
const GATE_NON_EMPTY = "non_empty_release";

function nonEmptyGate(ctx: ReleaseContext): GateResult {
  if (ctx.tasks.length === 0) {
    return {
      gate: GATE_NON_EMPTY,
      state: "failed",
      summary: "Release has no tasks (EMPTY_RELEASE)",
      blockers: [{ source: "system", reason: "EMPTY_RELEASE" }],
    };
  }
  return {
    gate: GATE_NON_EMPTY,
    state: "passed",
    summary: `${ctx.tasks.length} task(s) in release`,
    blockers: [],
  };
}

export type ReleaseCheckFn = (
  release: { version: string },
  tasks: {
    jiraKey: string;
    summary: string;
    description: string;
    priority?: string;
    status?: string;
  }[]
) => Promise<{ ready: boolean; blockers: { jiraKey: string; reason: string }[] }>;

/**
 * Run every mandatory gate plus the AI advisory gate.
 *
 * `releaseCheck` is the AI provider's `releaseCheck` (injected so the engine
 * stays testable and free of a hard dependency on the LLM module). An empty
 * release short-circuits the data-dependent gates (they all pass vacuously)
 * but `non_empty_release` still fails, so the aggregate is always `blocked`.
 */
export async function runGates(
  ctx: ReleaseContext,
  releaseCheck: ReleaseCheckFn
): Promise<GateResult[]> {
  const gates: GateResult[] = [];
  gates.push(nonEmptyGate(ctx));

  if (ctx.tasks.length > 0) {
    gates.push(taskStatusGate(ctx.tasks));
    gates.push(criticalBugsGate(ctx.tasks));
    gates.push(sentryGate(ctx.sentryIssues));
    gates.push(branchesGate(ctx.branchInfos));
    gates.push(pullRequestsGate(ctx.branchInfos));
    gates.push(dataFreshnessGate(ctx));
    gates.push(await aiAdvisoryGate(ctx, releaseCheck));
  }

  return gates;
}

/**
 * Aggregate gate results into a release status.
 *
 * - Any mandatory `failed` → `blocked`
 * - No failed but any mandatory `unknown` → `unknown`
 * - All mandatory `passed` (or `overridden`) → `ready`
 *
 * The AI advisory gate is excluded from this aggregation entirely: it can
 * never make a release ready, and it can never make one blocked.
 */
export function aggregateGates(gates: GateResult[]): "ready" | "blocked" | "unknown" {
  const mandatory = gates.filter((g) => g.gate !== GATE_AI_ADVISORY);
  if (mandatory.some((g) => g.state === "failed")) return "blocked";
  if (mandatory.some((g) => g.state === "unknown")) return "unknown";
  return "ready";
}

/** Flatten every gate's blockers into one list (used for persistence + notify). */
export function collectBlockers(gates: GateResult[]): Blocker[] {
  return gates.flatMap((g) => g.blockers);
}
