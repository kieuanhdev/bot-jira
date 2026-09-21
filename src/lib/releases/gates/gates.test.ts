import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM provider (ai-advisory injects a fn, but the engine must not
// depend on it; mock here to keep any stray import safe).
vi.mock("@/lib/ai", () => ({
  aiProvider: {
    name: "mock",
    score: vi.fn(),
    releaseCheck: vi.fn(),
  },
}));

// Mock env config for deterministic gates.
vi.mock("@/lib/env", () => ({
  env: {
    releaseDataFreshnessMinutes: 5,
    releaseDoneCategories: "done",
    releaseBlockingPriorities: "Blocker,Critical",
    sentryBlockingLevels: "fatal",
  },
  releaseDoneCategories: ["done"],
  releaseBlockingPriorities: ["Blocker", "Critical"],
  sentryBlockingLevels: ["fatal"],
}));

import {
  runGates,
  aggregateGates,
  collectBlockers,
  taskStatusGate,
  criticalBugsGate,
  sentryGate,
  branchesGate,
  pullRequestsGate,
  dataFreshnessGate,
  type ReleaseContext,
  type TaskInfo,
  type BranchInfoRow,
  type SentryIssueInfo,
} from "./index";

const NOW = new Date("2026-09-21T00:00:00Z");
const fresh = () => NOW;
const stale = (minsAgo: number) => new Date(NOW.getTime() - minsAgo * 60_000);

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    jiraKey: "PROJ-1",
    summary: "Task",
    description: "desc",
    priority: "Medium",
    status: "Done",
    statusCategory: "done",
    issueType: "Story",
    lastSyncedAt: fresh(),
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchInfoRow> = {}): BranchInfoRow {
  return {
    repo: "team/app",
    branch: "feature/x",
    prState: "MERGED",
    prDestinationBranch: "main",
    merged: true,
    checkedAt: fresh(),
    ...overrides,
  };
}

function makeSentry(overrides: Partial<SentryIssueInfo> = {}): SentryIssueInfo {
  return {
    id: "1",
    shortId: "ABC",
    title: "boom",
    level: "error",
    status: "unresolved",
    ...overrides,
  };
}

/** Build a ReleaseContext with sensible "all green" defaults. */
function makeCtx(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return {
    releaseId: "rel-1",
    version: "1.0.0",
    projectKey: "PROJ",
    tasks: [makeTask()],
    branchInfos: [makeBranch()],
    sentryIssues: [],
    sentryCheckedAt: fresh(),
    checkedAt: NOW,
    ...overrides,
  };
}

const okReleaseCheck = async () => ({ ready: true, blockers: [] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("individual gates", () => {
  describe("task_status", () => {
    it("passes when all tasks are done", () => {
      const r = taskStatusGate([makeTask(), makeTask({ jiraKey: "PROJ-2" })]);
      expect(r.state).toBe("passed");
    });
    it("fails when a task is not done", () => {
      const r = taskStatusGate([makeTask({ statusCategory: "indeterminate", status: "In Progress" })]);
      expect(r.state).toBe("failed");
      expect(r.blockers[0].jiraKey).toBe("PROJ-1");
    });
    it("is unknown (not failed/passed) when a category is unreadable", () => {
      const r = taskStatusGate([makeTask({ statusCategory: "unknown", status: "?" })]);
      expect(r.state).toBe("unknown");
    });
    it("unknown wins only when no non-done task is present", () => {
      const r = taskStatusGate([
        makeTask({ statusCategory: "unknown" }),
        makeTask({ jiraKey: "PROJ-2", statusCategory: "done" }),
      ]);
      expect(r.state).toBe("unknown");
    });
  });

  describe("critical_bugs", () => {
    it("passes when no open blocking bugs", () => {
      expect(criticalBugsGate([makeTask()]).state).toBe("passed");
    });
    it("fails on an open Blocker bug", () => {
      const r = criticalBugsGate([
        makeTask({ issueType: "Bug", statusCategory: "indeterminate", priority: "Blocker" }),
      ]);
      expect(r.state).toBe("failed");
      expect(r.blockers[0].source).toBe("jira");
    });
    it("fails on an open Critical defect", () => {
      const r = criticalBugsGate([
        makeTask({ issueType: "Defect", statusCategory: "new", priority: "Critical" }),
      ]);
      expect(r.state).toBe("failed");
    });
    it("does not fail on a done bug", () => {
      const r = criticalBugsGate([
        makeTask({ issueType: "Bug", statusCategory: "done", priority: "Blocker" }),
      ]);
      expect(r.state).toBe("passed");
    });
    it("does not fail on a Major (non-blocking) priority bug", () => {
      const r = criticalBugsGate([
        makeTask({ issueType: "Bug", statusCategory: "indeterminate", priority: "Major" }),
      ]);
      expect(r.state).toBe("passed");
    });
    it("does not fail on a non-bug type", () => {
      const r = criticalBugsGate([
        makeTask({ issueType: "Story", statusCategory: "indeterminate", priority: "Blocker" }),
      ]);
      expect(r.state).toBe("passed");
    });
  });

  describe("sentry", () => {
    it("passes with no issues", () => {
      expect(sentryGate([]).state).toBe("passed");
    });
    it("passes when no blocking-level issue present", () => {
      expect(sentryGate([makeSentry({ level: "error" })]).state).toBe("passed");
    });
    it("fails on an unresolved fatal issue", () => {
      const r = sentryGate([makeSentry({ level: "fatal", permalinkUrl: "https://s/1" })]);
      expect(r.state).toBe("failed");
      expect(r.blockers[0].source).toBe("sentry");
      expect(r.blockers[0].url).toBe("https://s/1");
    });
    it("is unknown when Sentry data is unavailable (null)", () => {
      const r = sentryGate(null);
      expect(r.state).toBe("unknown");
    });
  });

  describe("branches", () => {
    it("passes when every branch has a PR", () => {
      const r = branchesGate([makeBranch(), makeBranch({ branch: "b2", prState: "OPEN" })]);
      expect(r.state).toBe("passed");
    });
    it("fails when a branch has no PR", () => {
      const r = branchesGate([makeBranch({ prState: null, merged: false })]);
      expect(r.state).toBe("failed");
      expect(r.blockers[0].source).toBe("bitbucket");
    });
    it("passes vacuously with no branches", () => {
      expect(branchesGate([]).state).toBe("passed");
    });
  });

  describe("pull_requests", () => {
    it("passes when all PRs are merged", () => {
      const r = pullRequestsGate([makeBranch(), makeBranch({ branch: "b2" })]);
      expect(r.state).toBe("passed");
    });
    it("fails when a PR is CLOSED", () => {
      const r = pullRequestsGate([makeBranch({ prState: "CLOSED", merged: false })]);
      expect(r.state).toBe("failed");
    });
    it("fails when a PR is DECLINED", () => {
      const r = pullRequestsGate([makeBranch({ prState: "DECLINED", merged: false })]);
      expect(r.state).toBe("failed");
    });
    it("is unknown when a PR is still OPEN", () => {
      const r = pullRequestsGate([makeBranch({ prState: "OPEN", merged: false })]);
      expect(r.state).toBe("unknown");
    });
    it("is unknown when no branch has PR data at all", () => {
      const r = pullRequestsGate([makeBranch({ prState: null, merged: false })]);
      expect(r.state).toBe("unknown");
    });
  });

  describe("data_freshness", () => {
    it("passes when all sources are fresh", () => {
      expect(dataFreshnessGate(makeCtx()).state).toBe("passed");
    });
    it("is unknown when a Jira task is stale", () => {
      const r = dataFreshnessGate(makeCtx({ tasks: [makeTask({ lastSyncedAt: stale(10) })] }));
      expect(r.state).toBe("unknown");
      expect(r.blockers[0].source).toBe("jira");
    });
    it("is unknown when a branch is stale", () => {
      const r = dataFreshnessGate(makeCtx({ branchInfos: [makeBranch({ checkedAt: stale(10) })] }));
      expect(r.state).toBe("unknown");
      expect(r.blockers[0].source).toBe("bitbucket");
    });
    it("is unknown when Sentry was never verified", () => {
      const r = dataFreshnessGate(makeCtx({ sentryCheckedAt: null, sentryIssues: null }));
      expect(r.state).toBe("unknown");
      expect(r.blockers.some((b) => b.source === "sentry")).toBe(true);
    });
  });

  describe("ai_advisory (via runGates)", () => {
    it("reports advisory blockers without failing", async () => {
      const ctx = makeCtx();
      const rc = async () => ({
        ready: false,
        blockers: [{ jiraKey: "PROJ-1", reason: "risky" }],
      });
      const gates = await runGates(ctx, rc);
      const ai = gates.find((g) => g.gate === "ai_advisory")!;
      expect(ai.state).toBe("passed");
      expect(ai.blockers[0].source).toBe("system");
    });
    it("is unknown with 'AI unavailable' when the provider throws", async () => {
      const ctx = makeCtx();
      const rc = async () => {
        throw new Error("boom");
      };
      const gates = await runGates(ctx, rc);
      const ai = gates.find((g) => g.gate === "ai_advisory")!;
      expect(ai.state).toBe("unknown");
      expect(ai.summary).toBe("AI unavailable");
    });
  });
});

describe("aggregateGates", () => {
  const passed = (gate: string) => ({ gate, state: "passed" as const, summary: "ok", blockers: [] });
  const withState = (gate: string, state: "failed" | "unknown") =>
    ({ gate, state, summary: "ok", blockers: [] }) as import("./types").GateResult;

  it("any mandatory failed -> blocked", () => {
    const gates = [passed("task_status"), withState("critical_bugs", "failed")];
    expect(aggregateGates(gates)).toBe("blocked");
  });
  it("unknown (no failed) -> unknown", () => {
    const gates = [passed("task_status"), withState("sentry", "unknown")];
    expect(aggregateGates(gates)).toBe("unknown");
  });
  it("all passed -> ready", () => {
    const gates = [passed("task_status"), passed("sentry"), passed("pull_requests")];
    expect(aggregateGates(gates)).toBe("ready");
  });
  it("AI unknown never makes the release blocked/unknown", () => {
    const gates = [
      passed("task_status"),
      passed("sentry"),
      withState("ai_advisory", "unknown"),
    ];
    expect(aggregateGates(gates)).toBe("ready");
  });
  it("AI advisory with blockers never blocks", () => {
    const gates = [
      passed("task_status"),
      { gate: "ai_advisory", state: "passed" as const, summary: "flag", blockers: [{ source: "system", reason: "x" }] },
    ];
    expect(aggregateGates(gates)).toBe("ready");
  });
});

describe("runGates + end-to-end semantics", () => {
  it("empty release is always blocked", async () => {
    const ctx = makeCtx({ tasks: [] });
    const gates = await runGates(ctx, okReleaseCheck);
    expect(aggregateGates(gates)).toBe("blocked");
    const nonEmpty = gates.find((g) => g.gate === "non_empty_release")!;
    expect(nonEmpty.state).toBe("failed");
    expect(collectBlockers(gates).some((b) => b.reason === "EMPTY_RELEASE")).toBe(true);
  });

  it("stale data yields unknown, never ready", async () => {
    const ctx = makeCtx({
      tasks: [makeTask({ lastSyncedAt: stale(30) })],
      branchInfos: [],
      sentryIssues: [],
    });
    const gates = await runGates(ctx, okReleaseCheck);
    expect(aggregateGates(gates)).toBe("unknown");
  });

  it("all good -> ready even if AI is unavailable", async () => {
    const ctx = makeCtx();
    const throwing = async () => {
      throw new Error("down");
    };
    const gates = await runGates(ctx, throwing);
    expect(aggregateGates(gates)).toBe("ready");
  });

  it("open blocking bug -> blocked", async () => {
    const ctx = makeCtx({
      tasks: [makeTask({ issueType: "Bug", statusCategory: "indeterminate", priority: "Blocker" })],
      branchInfos: [],
      sentryIssues: [],
    });
    const gates = await runGates(ctx, okReleaseCheck);
    expect(aggregateGates(gates)).toBe("blocked");
  });

  it("unmerged PR -> blocked", async () => {
    const ctx = makeCtx({
      tasks: [makeTask()],
      branchInfos: [makeBranch({ prState: "CLOSED", merged: false })],
      sentryIssues: [],
    });
    const gates = await runGates(ctx, okReleaseCheck);
    expect(aggregateGates(gates)).toBe("blocked");
  });

  it("Sentry outage -> unknown, never ready or crash", async () => {
    const ctx = makeCtx({ sentryIssues: null, sentryCheckedAt: null, branchInfos: [] });
    const gates = await runGates(ctx, okReleaseCheck);
    expect(aggregateGates(gates)).toBe("unknown");
    const sentry = gates.find((g) => g.gate === "sentry")!;
    expect(sentry.state).toBe("unknown");
  });
});
