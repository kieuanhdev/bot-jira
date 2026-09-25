import { describe, it, expect } from "vitest";
import { dependencyVersionConsistencyGate } from "./dependency-version-consistency";
import { dependencyGraphIntegrityGate } from "./dependency-graph-integrity";
import type { TaskInfo } from "./types";

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    jiraKey: "PROJ-1",
    summary: "Task",
    description: "desc",
    priority: "Medium",
    status: "Done",
    statusCategory: "done",
    issueType: "Story",
    lastSyncedAt: new Date(),
    ...overrides,
  };
}

describe("dependency_version_consistency gate (DEP-10)", () => {
  it("passes when all same-project dependencies have release version", () => {
    const tasks: TaskInfo[] = [
      makeTask({ jiraKey: "PROJ-1", inclusion: "direct", hasReleaseVersion: true }),
      makeTask({
        jiraKey: "PROJ-2",
        inclusion: "dependency",
        sameProject: true,
        hasReleaseVersion: true,
      }),
    ];

    const result = dependencyVersionConsistencyGate(tasks);
    expect(result.state).toBe("passed");
    expect(result.blockers).toHaveLength(0);
  });

  it("fails when a same-project dependency lacks release version", () => {
    const tasks: TaskInfo[] = [
      makeTask({ jiraKey: "PROJ-1", inclusion: "direct", hasReleaseVersion: true }),
      makeTask({
        jiraKey: "PROJ-2",
        inclusion: "dependency",
        sameProject: true,
        hasReleaseVersion: false,
      }),
    ];

    const result = dependencyVersionConsistencyGate(tasks);
    expect(result.state).toBe("failed");
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].jiraKey).toBe("PROJ-2");
    expect(result.blockers[0].reason).toContain("MISSING_RELEASE_VERSION");
  });

  it("does not fail when an external-project dependency lacks release version", () => {
    const tasks: TaskInfo[] = [
      makeTask({ jiraKey: "PROJ-1", inclusion: "direct", hasReleaseVersion: true }),
      makeTask({
        jiraKey: "OTHER-99",
        inclusion: "dependency",
        sameProject: false, // external project
        hasReleaseVersion: false,
      }),
    ];

    const result = dependencyVersionConsistencyGate(tasks);
    expect(result.state).toBe("passed");
    expect(result.blockers).toHaveLength(0);
  });
});

describe("dependency_graph_integrity gate (DEP-10)", () => {
  it("passes when graph is complete, acyclic, and untruncated", () => {
    const result = dependencyGraphIntegrityGate({
      cycles: [],
      truncated: false,
      missingKeys: [],
    });
    expect(result.state).toBe("passed");
  });

  it("fails when graph has a cycle", () => {
    const result = dependencyGraphIntegrityGate({
      cycles: [{ path: ["PROJ-1", "PROJ-2", "PROJ-1"] }],
      truncated: false,
      missingKeys: [],
    });
    expect(result.state).toBe("failed");
    expect(result.blockers[0].reason).toContain("DEPENDENCY_CYCLE");
  });

  it("fails when graph is truncated", () => {
    const result = dependencyGraphIntegrityGate({
      cycles: [],
      truncated: true,
      missingKeys: [],
    });
    expect(result.state).toBe("failed");
    expect(result.blockers[0].reason).toContain("GRAPH_TRUNCATED");
  });

  it("reports unknown when endpoints are missing from cache", () => {
    const result = dependencyGraphIntegrityGate({
      cycles: [],
      truncated: false,
      missingKeys: ["MISSING-1"],
    });
    expect(result.state).toBe("unknown");
    expect(result.blockers[0].reason).toContain("MISSING_DEPENDENCY_DATA");
  });
});
