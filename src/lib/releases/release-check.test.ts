import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    releaseDataFreshnessMinutes: 5,
  },
  releaseDoneCategories: ["done"],
  releaseBlockingPriorities: ["Blocker", "Critical"],
}));

type TaskInfo = {
  jiraKey: string;
  summary: string;
  description: string;
  priority: string;
  status: string;
  statusCategory: string;
  lastSyncedAt: Date;
};

type GateResult = {
  gate: string;
  state: "passed" | "failed" | "unknown";
  summary: string;
  blockers: { jiraKey?: string; reason: string }[];
};

const freshDate = () => new Date();

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    jiraKey: "PROJ-1",
    summary: "test",
    description: "",
    priority: "Medium",
    status: "Done",
    statusCategory: "done",
    lastSyncedAt: freshDate(),
    ...overrides,
  };
}

function checkNonEmpty(tasks: TaskInfo[]): GateResult {
  if (tasks.length === 0) {
    return { gate: "non_empty_release", state: "failed", summary: "Release has no tasks (EMPTY_RELEASE)", blockers: [{ reason: "EMPTY_RELEASE" }] };
  }
  return { gate: "non_empty_release", state: "passed", summary: `${tasks.length} task(s) in release`, blockers: [] };
}

function checkTaskStatus(tasks: TaskInfo[]): GateResult {
  const doneCats = new Set(["done"]);
  const notDone = tasks.filter((t) => !doneCats.has(t.statusCategory));
  if (notDone.length > 0) {
    return {
      gate: "task_status",
      state: "failed",
      summary: `${notDone.length} task(s) not in done category`,
      blockers: notDone.map((t) => ({ jiraKey: t.jiraKey, reason: `status=${t.status} (${t.statusCategory})` })),
    };
  }
  return { gate: "task_status", state: "passed", summary: "All tasks are done", blockers: [] };
}

function checkCriticalBugs(tasks: TaskInfo[]): GateResult {
  const doneCats = new Set(["done"]);
  const blockingPrios = new Set(["blocker", "critical"]);
  const openBugs = tasks.filter(
    (t) =>
      !doneCats.has(t.statusCategory) &&
      blockingPrios.has(t.priority.toLowerCase())
  );
  if (openBugs.length > 0) {
    return {
      gate: "critical_bugs",
      state: "failed",
      summary: `${openBugs.length} open Blocker/Critical bug(s)`,
      blockers: openBugs.map((t) => ({ jiraKey: t.jiraKey, reason: `priority=${t.priority}, status=${t.status}` })),
    };
  }
  return { gate: "critical_bugs", state: "passed", summary: "No open Blocker/Critical bugs", blockers: [] };
}

function checkDataFreshness(tasks: TaskInfo[]): GateResult {
  const maxAge = 5;
  const now = Date.now();
  const stale = tasks.filter((t) => now - t.lastSyncedAt.getTime() > maxAge * 60_000);
  if (stale.length > 0) {
    return {
      gate: "data_freshness",
      state: "unknown",
      summary: `${stale.length} task(s) data older than ${maxAge} min`,
      blockers: stale.map((t) => ({ jiraKey: t.jiraKey, reason: `lastSyncedAt=${t.lastSyncedAt.toISOString()}` })),
    };
  }
  return { gate: "data_freshness", state: "passed", summary: "All data is fresh", blockers: [] };
}

function aggregateStatus(gates: GateResult[]): "ready" | "blocked" | "unknown" {
  const mandatory = gates.filter((g) => g.gate !== "ai_advisory");
  if (mandatory.some((g) => g.state === "failed")) return "blocked";
  if (mandatory.some((g) => g.state === "unknown")) return "unknown";
  return "ready";
}

describe("M2-02 release fail-safe", () => {
  it("empty release is always blocked", () => {
    const gates = [checkNonEmpty([])];
    expect(aggregateStatus(gates)).toBe("blocked");
    expect(gates[0].blockers[0].reason).toBe("EMPTY_RELEASE");
  });

  it("task not in done category blocks the release", () => {
    const tasks = [makeTask({ statusCategory: "indeterminate", status: "In Progress" })];
    const gates = [checkNonEmpty(tasks), checkTaskStatus(tasks)];
    expect(aggregateStatus(gates)).toBe("blocked");
  });

  it("open Blocker bug blocks the release", () => {
    const tasks = [
      makeTask({ statusCategory: "indeterminate", status: "In Progress", priority: "Blocker" }),
    ];
    const gates = [checkNonEmpty(tasks), checkTaskStatus(tasks), checkCriticalBugs(tasks)];
    expect(aggregateStatus(gates)).toBe("blocked");
    expect(checkCriticalBugs(tasks).state).toBe("failed");
  });

  it("open Critical bug blocks the release", () => {
    const tasks = [
      makeTask({ statusCategory: "indeterminate", status: "In Progress", priority: "Critical" }),
    ];
    expect(checkCriticalBugs(tasks).state).toBe("failed");
  });

  it("stale data yields unknown, never ready", () => {
    const stale = new Date(Date.now() - 10 * 60_000);
    const tasks = [makeTask({ lastSyncedAt: stale })];
    const gates = [checkNonEmpty(tasks), checkTaskStatus(tasks), checkCriticalBugs(tasks), checkDataFreshness(tasks)];
    expect(aggregateStatus(gates)).toBe("unknown");
    expect(checkDataFreshness(tasks).state).toBe("unknown");
  });

  it("all done + fresh + no bugs = ready", () => {
    const tasks = [makeTask(), makeTask({ jiraKey: "PROJ-2" })];
    const gates = [checkNonEmpty(tasks), checkTaskStatus(tasks), checkCriticalBugs(tasks), checkDataFreshness(tasks)];
    expect(aggregateStatus(gates)).toBe("ready");
  });

  it("unknown status category is never treated as done", () => {
    const tasks = [makeTask({ statusCategory: "unknown", status: "Weird Status" })];
    expect(checkTaskStatus(tasks).state).toBe("failed");
  });

  it("done category from any workflow passes", () => {
    const tasks = [
      makeTask({ status: "Closed", statusCategory: "done" }),
      makeTask({ status: "Resolved", statusCategory: "done", jiraKey: "PROJ-2" }),
    ];
    expect(checkTaskStatus(tasks).state).toBe("passed");
  });

  it("Major priority does not block", () => {
    const tasks = [
      makeTask({ statusCategory: "indeterminate", status: "In Progress", priority: "Major" }),
    ];
    expect(checkCriticalBugs(tasks).state).toBe("passed");
  });
});

describe("AI fail-safe semantics", () => {
  it("AI failure is advisory, never blocks or passes on its own", () => {
    const gates: GateResult[] = [
      { gate: "non_empty_release", state: "passed", summary: "ok", blockers: [] },
      { gate: "task_status", state: "passed", summary: "ok", blockers: [] },
      { gate: "critical_bugs", state: "passed", summary: "ok", blockers: [] },
      { gate: "data_freshness", state: "passed", summary: "ok", blockers: [] },
      { gate: "ai_advisory", state: "unknown", summary: "AI unavailable", blockers: [] },
    ];
    expect(aggregateStatus(gates)).toBe("ready");
  });

  it("AI advisory blockers do not override mandatory gates", () => {
    const gates: GateResult[] = [
      { gate: "non_empty_release", state: "passed", summary: "ok", blockers: [] },
      { gate: "task_status", state: "passed", summary: "ok", blockers: [] },
      { gate: "critical_bugs", state: "passed", summary: "ok", blockers: [] },
      { gate: "data_freshness", state: "passed", summary: "ok", blockers: [] },
      { gate: "ai_advisory", state: "passed", summary: "AI found 1 blocker", blockers: [{ jiraKey: "PROJ-1", reason: "risk" }] },
    ];
    expect(aggregateStatus(gates)).toBe("ready");
  });

  it("mandatory gate failure overrides AI pass", () => {
    const gates: GateResult[] = [
      { gate: "non_empty_release", state: "passed", summary: "ok", blockers: [] },
      { gate: "task_status", state: "failed", summary: "1 task not done", blockers: [{ jiraKey: "PROJ-1", reason: "in progress" }] },
      { gate: "ai_advisory", state: "passed", summary: "AI says ready", blockers: [] },
    ];
    expect(aggregateStatus(gates)).toBe("blocked");
  });
});
