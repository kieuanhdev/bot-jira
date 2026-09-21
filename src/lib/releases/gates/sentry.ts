import { sentryBlockingLevels } from "@/lib/env";
import type { Blocker, GateResult, SentryIssueInfo } from "./types";

/**
 * sentry — no unresolved issue at a release-blocking level.
 *
 * - `issues == null` means the source could not be read → `unknown`.
 * - A readable empty set passes (verified no blocking issues).
 * - Any unresolved issue at a blocking level → `failed`.
 * Data staleness is enforced by the dedicated `data_freshness` gate.
 */
export function sentryGate(issues: SentryIssueInfo[] | null): GateResult {
  if (issues == null) {
    return {
      gate: "sentry",
      state: "unknown",
      summary: "Sentry data unavailable — cannot verify no blocking issues",
      blockers: [{ source: "sentry", reason: "Sentry source could not be read" }],
    };
  }

  const blocking = new Set(sentryBlockingLevels.map((l) => l.toLowerCase()));
  const offenders: Blocker[] = issues
    .filter((i) => (i.level ?? "").toLowerCase() !== "" && blocking.has((i.level ?? "").toLowerCase()))
    .map((i) => ({
      source: "sentry",
      reason: `unresolved ${i.level} issue: ${i.title}`,
      url: i.permalinkUrl,
    }));

  if (offenders.length > 0) {
    return {
      gate: "sentry",
      state: "failed",
      summary: `${offenders.length} unresolved blocking-level Sentry issue(s)`,
      blockers: offenders,
    };
  }
  return {
    gate: "sentry",
    state: "passed",
    summary:
      issues.length > 0
        ? `No blocking-level Sentry issues (${issues.length} unresolved reviewed)`
        : "No unresolved Sentry issues",
    blockers: [],
  };
}
