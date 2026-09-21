import type { Blocker, GateResult, ReleaseContext } from "./types";

/**
 * ai_advisory — advisory-only. Reports AI-flagged risks as advisory blockers.
 *
 * This gate is NEVER mandatory: it must not turn a release ready, and it must
 * not turn a release blocked. On success it reports advisory blockers (state
 * stays `passed` even when blockers are present, mirroring the M2
 * fail-safe). On failure (provider throws) the state is `unknown` with the
 * summary "AI unavailable".
 *
 * The provider call is injected so the gate is pure/testable.
 */
export async function aiAdvisoryGate(
  ctx: ReleaseContext,
  releaseCheck: (
    release: { version: string },
    tasks: {
      jiraKey: string;
      summary: string;
      description: string;
      priority?: string;
      status?: string;
    }[]
  ) => Promise<{ ready: boolean; blockers: { jiraKey: string; reason: string }[] }>
): Promise<GateResult> {
  try {
    const ai = await releaseCheck(
      { version: ctx.version },
      ctx.tasks.map((t) => ({
        jiraKey: t.jiraKey,
        summary: t.summary,
        description: t.description,
        priority: t.priority,
        status: t.status,
      }))
    );
    const blockers: Blocker[] = (ai.blockers ?? []).map((b) => ({
      jiraKey: b.jiraKey,
      source: "system",
      reason: `[AI advisory] ${b.reason}`,
    }));
    return {
      gate: "ai_advisory",
      state: "passed",
      summary:
        blockers.length > 0
          ? `AI flagged ${blockers.length} advisory blocker(s)`
          : "AI found no blockers",
      blockers,
    };
  } catch {
    return {
      gate: "ai_advisory",
      state: "unknown",
      summary: "AI unavailable",
      blockers: [],
    };
  }
}
