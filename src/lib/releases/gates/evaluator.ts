import type { Blocker, GateResult, ReleaseContext } from "./types";
import { taskStatusGate } from "./task-status";
import { criticalBugsGate } from "./critical-bugs";
import { sentryGate } from "./sentry";
import { branchesGate } from "./branches";
import { pullRequestsGate } from "./pull-requests";
import { dataFreshnessGate } from "./data-freshness";
import { aiAdvisoryGate } from "./ai-advisory";
import { manualApprovalGate } from "./manual-approval";
import { ciGate } from "./ci";
import { dependencyVersionConsistencyGate } from "./dependency-version-consistency";
import { dependencyGraphIntegrityGate } from "./dependency-graph-integrity";

/** Gates that determine release readiness. `ai_advisory` is never mandatory. */
export const GATE_AI_ADVISORY = "ai_advisory";
export const GATE_NON_EMPTY = "non_empty_release";
export const GATE_CI = "ci";

/**
 * Gates that may NOT be overridden (REL-03). `non_empty_release` must always be
 * evaluated from data; `ci` is a mandatory source-of-truth gate that an override
 * would let us ship a broken build.
 */
export const NON_OVERRIDABLE = new Set<string>([GATE_NON_EMPTY, GATE_CI]);

export function nonEmptyGate(ctx: ReleaseContext): GateResult {
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
 * A valid gate override: not revoked, not expired, and for a gate that is
 * overridable (non_empty_release and ci can never be overridden).
 */
export type GateOverrideRow = {
  gate: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  reason?: string;
  createdById?: string;
};

export function overrideIsActive(o: GateOverrideRow, now: Date): boolean {
  if (NON_OVERRIDABLE.has(o.gate)) return false;
  if (o.revokedAt) return false;
  if (o.expiresAt && o.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

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
  releaseCheck: ReleaseCheckFn,
  opts: { overrides?: GateOverrideRow[]; now?: Date } = {}
): Promise<GateResult[]> {
  const gates: GateResult[] = [];
  gates.push(nonEmptyGate(ctx));
  const now = opts.now ?? new Date();
  const overrides = opts.overrides ?? [];

  // Pre-compute which gates have an active override so the aggregation treats
  // them as "overridden" (not failed/unknown) while the data still shows the
  // underlying state in the summary.
  const overridden = new Set(
    overrides.filter((o) => overrideIsActive(o, now)).map((o) => o.gate)
  );

  const applyOverride = (g: GateResult): GateResult => {
    if (!overridden.has(g.gate) || g.state === "passed") return g;
    return { ...g, state: "overridden", summary: `${g.summary} (overridden)` };
  };

  if (ctx.tasks.length > 0) {
    gates.push(applyOverride(taskStatusGate(ctx.tasks)));
    gates.push(applyOverride(criticalBugsGate(ctx.tasks)));
    gates.push(applyOverride(sentryGate(ctx.sentryIssues)));
    gates.push(applyOverride(branchesGate(ctx.branchInfos)));
    gates.push(applyOverride(pullRequestsGate(ctx.branchInfos)));
    gates.push(applyOverride(dataFreshnessGate(ctx)));
    gates.push(applyOverride(dependencyVersionConsistencyGate(ctx.tasks)));
    gates.push(applyOverride(dependencyGraphIntegrityGate(ctx.dependencyGraph)));
    gates.push(applyOverride(await aiAdvisoryGate(ctx, releaseCheck)));
    // REL-03 — manual approval (mandatory when approvals are required).
    gates.push(
      applyOverride(
        manualApprovalGate(ctx.requiredApprovals ?? [], ctx.approvalsPresent ?? [])
      )
    );
    // REL-04 — CI gate (mandatory + non-overridable when enabled). applyOverride
    // is a no-op here because `ci` is in NON_OVERRIDABLE.
    if (ctx.ciGateEnabled) {
      gates.push(applyOverride(ciGate(ctx.ciBuilds ?? [])));
    }
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

export type ReleaseGatesEvaluation = {
  status: "ready" | "blocked" | "unknown";
  ready: boolean;
  gates: GateResult[];
  blockers: Blocker[];
  summary: string;
};

/**
 * High-level pure evaluator: evaluates gates, applies overrides, aggregates status,
 * collects blockers, and constructs summary in one cohesive step.
 */
export async function evaluateReleaseGates(
  ctx: ReleaseContext,
  options: {
    releaseCheck?: ReleaseCheckFn;
    overrides?: GateOverrideRow[];
    now?: Date;
  } = {}
): Promise<ReleaseGatesEvaluation> {
  const rc = options.releaseCheck ?? (async () => ({ ready: true, blockers: [] }));
  const gates = await runGates(ctx, rc, {
    overrides: options.overrides,
    now: options.now,
  });
  const status = aggregateGates(gates);
  const blockers = collectBlockers(gates);
  const summary = gates.map((g) => `${g.gate}=${g.state}`).join(", ");

  return {
    status,
    ready: status === "ready",
    gates,
    blockers,
    summary,
  };
}
