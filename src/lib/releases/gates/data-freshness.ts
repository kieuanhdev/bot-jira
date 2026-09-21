import { env } from "@/lib/env";
import type { Blocker, GateResult, ReleaseContext } from "./types";

/**
 * data_freshness — every source (Jira tasks, Bitbucket branches, Sentry)
 * must have been synced within `RELEASE_DATA_FRESHNESS_MINUTES`. Any stale
 * source yields `unknown` with the stale items as blockers.
 */
export function dataFreshnessGate(ctx: ReleaseContext): GateResult {
  const maxAgeMs = env.releaseDataFreshnessMinutes * 60_000;
  const now = ctx.checkedAt.getTime();

  const stale: Blocker[] = [];

  for (const t of ctx.tasks) {
    if (now - t.lastSyncedAt.getTime() > maxAgeMs) {
      stale.push({
        jiraKey: t.jiraKey,
        source: "jira",
        reason: `Jira data last synced ${t.lastSyncedAt.toISOString()} (> ${env.releaseDataFreshnessMinutes}m)`,
      });
    }
  }

  for (const b of ctx.branchInfos) {
    if (now - b.checkedAt.getTime() > maxAgeMs) {
      stale.push({
        source: "bitbucket",
        reason: `branch ${b.repo}:${b.branch} last checked ${b.checkedAt.toISOString()} (> ${env.releaseDataFreshnessMinutes}m)`,
      });
    }
  }

  if (ctx.sentryCheckedAt == null) {
    stale.push({
      source: "sentry",
      reason: "Sentry source not verified (no fresh check)",
    });
  } else if (now - ctx.sentryCheckedAt.getTime() > maxAgeMs) {
    stale.push({
      source: "sentry",
      reason: `Sentry data last verified ${ctx.sentryCheckedAt.toISOString()} (> ${env.releaseDataFreshnessMinutes}m)`,
    });
  }

  if (stale.length > 0) {
    return {
      gate: "data_freshness",
      state: "unknown",
      summary: `${stale.length} source(s) older than ${env.releaseDataFreshnessMinutes} min`,
      blockers: stale,
    };
  }
  return {
    gate: "data_freshness",
    state: "passed",
    summary: "All source data is fresh",
    blockers: [],
  };
}
