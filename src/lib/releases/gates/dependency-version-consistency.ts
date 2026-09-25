import type { Blocker, GateResult, TaskInfo } from "./types";

export const GATE_DEPENDENCY_VERSION_CONSISTENCY = "dependency_version_consistency";

/**
 * dependency_version_consistency — dependencies in the same Jira project as the
 * release must have the release's Fix Version attached in Jira (DEP-10).
 *
 * Rules:
 *  - Same-project dependencies with Fix Version: passed.
 *  - Same-project dependencies missing Fix Version: failed (blocker: MISSING_RELEASE_VERSION).
 *  - External-project dependencies: not applicable (never fail this gate).
 */
export function dependencyVersionConsistencyGate(tasks: TaskInfo[]): GateResult {
  const missingVersionBlockers: Blocker[] = [];

  const dependencies = tasks.filter((t) => t.inclusion === "dependency");

  for (const dep of dependencies) {
    // Only same-project dependencies must have the release version
    const isSameProject = dep.sameProject ?? true;
    if (!isSameProject) continue;

    if (dep.hasReleaseVersion === false) {
      missingVersionBlockers.push({
        jiraKey: dep.jiraKey,
        source: "jira",
        reason: "MISSING_RELEASE_VERSION: Dependency cùng project chưa có Fix Version của release",
      });
    }
  }

  if (missingVersionBlockers.length > 0) {
    return {
      gate: GATE_DEPENDENCY_VERSION_CONSISTENCY,
      state: "failed",
      summary: `${missingVersionBlockers.length} dependency cùng project chưa được gán Fix Version`,
      blockers: missingVersionBlockers,
      details: {
        missingCount: missingVersionBlockers.length,
        missingKeys: missingVersionBlockers.map((b) => b.jiraKey),
        actionHint: "sync_dependency_versions",
      },
    };
  }

  return {
    gate: GATE_DEPENDENCY_VERSION_CONSISTENCY,
    state: "passed",
    summary:
      dependencies.length > 0
        ? "Toàn bộ dependency cùng project đã có Fix Version nhất quán"
        : "Không có task phụ thuộc",
    blockers: [],
  };
}
