import type { Blocker, GateResult, ReleaseContext } from "./types";

export const GATE_DEPENDENCY_GRAPH_INTEGRITY = "dependency_graph_integrity";

/**
 * dependency_graph_integrity — ensures the release dependency graph is complete,
 * acyclic, and within traversal limits (DEP-10).
 *
 * Rules:
 *  - Cycle detected: failed (blocker: DEPENDENCY_CYCLE).
 *  - Graph truncated (exceeded depth/issue limits): failed (blocker: GRAPH_TRUNCATED).
 *  - Missing keys (link endpoints unreadable/missing from cache): unknown (blocker: MISSING_DEPENDENCY_DATA).
 *  - Otherwise: passed.
 */
export function dependencyGraphIntegrityGate(
  graph?: ReleaseContext["dependencyGraph"]
): GateResult {
  if (!graph) {
    return {
      gate: GATE_DEPENDENCY_GRAPH_INTEGRITY,
      state: "passed",
      summary: "Đồ thị dependency hợp lệ",
      blockers: [],
    };
  }

  const blockers: Blocker[] = [];

  // 1. Check for cycles
  if (graph.cycles && graph.cycles.length > 0) {
    for (const cycle of graph.cycles) {
      blockers.push({
        source: "system",
        reason: `DEPENDENCY_CYCLE: Phát hiện vòng lặp phụ thuộc (${cycle.path.join(" -> ")})`,
      });
    }
    return {
      gate: GATE_DEPENDENCY_GRAPH_INTEGRITY,
      state: "failed",
      summary: `Phát hiện ${graph.cycles.length} vòng lặp phụ thuộc (cycle) trong release`,
      blockers,
      details: { cycles: graph.cycles },
    };
  }

  // 2. Check for truncation
  if (graph.truncated) {
    return {
      gate: GATE_DEPENDENCY_GRAPH_INTEGRITY,
      state: "failed",
      summary: "Đồ thị phụ thuộc vượt giới hạn tối đa và bị cắt cụt (truncated)",
      blockers: [
        {
          source: "system",
          reason: "GRAPH_TRUNCATED: Đồ thị dependency vượt giới hạn maxDepth hoặc maxIssues",
        },
      ],
    };
  }

  // 3. Check for unreadable / missing endpoints
  if (graph.missingKeys && graph.missingKeys.length > 0) {
    for (const key of graph.missingKeys) {
      blockers.push({
        jiraKey: key,
        source: "jira",
        reason: `MISSING_DEPENDENCY_DATA: Không đọc được dữ liệu cache của task ${key}`,
      });
    }
    return {
      gate: GATE_DEPENDENCY_GRAPH_INTEGRITY,
      state: "unknown",
      summary: `${graph.missingKeys.length} task phụ thuộc không đọc được dữ liệu hoặc bị thiếu trong cache`,
      blockers,
      details: { missingKeys: graph.missingKeys },
    };
  }

  return {
    gate: GATE_DEPENDENCY_GRAPH_INTEGRITY,
    state: "passed",
    summary: "Đồ thị phụ thuộc toàn vẹn (không có cycle, không bị cắt cụt)",
    blockers: [],
  };
}
