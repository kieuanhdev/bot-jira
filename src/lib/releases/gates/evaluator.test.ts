import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  nonEmptyGate,
  overrideIsActive,
  aggregateGates,
  collectBlockers,
  evaluateReleaseGates,
  GATE_NON_EMPTY,
  GATE_CI,
  GATE_AI_ADVISORY,
  NON_OVERRIDABLE,
  type GateOverrideRow,
} from "./evaluator";
import type { GateResult, ReleaseContext, TaskInfo, BranchInfoRow } from "./types";

vi.mock("@/lib/env", () => ({
  env: {
    releaseDataFreshnessMinutes: 5,
    releaseDoneCategories: "done",
    releaseBlockingPriorities: "Blocker,Critical",
    sentryBlockingLevels: "fatal",
    ciGateEnabled: false,
  },
  releaseDoneCategories: ["done"],
  releaseBlockingPriorities: ["Blocker", "Critical"],
  sentryBlockingLevels: ["fatal"],
}));

const NOW = new Date("2026-10-09T00:00:00Z");

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    jiraKey: "EPM-1",
    summary: "Task",
    description: "desc",
    priority: "Medium",
    status: "Done",
    statusCategory: "done",
    issueType: "Story",
    lastSyncedAt: NOW,
    ...overrides,
  };
}

function makeBranch(overrides: Partial<BranchInfoRow> = {}): BranchInfoRow {
  return {
    repo: "repo-1",
    branch: "feature/EPM-1",
    prState: "MERGED",
    prDestinationBranch: "main",
    merged: true,
    checkedAt: NOW,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return {
    releaseId: "rel-1",
    version: "1.0.0",
    projectKey: "EPM",
    tasks: [makeTask()],
    branchInfos: [makeBranch()],
    sentryIssues: [],
    sentryCheckedAt: NOW,
    checkedAt: NOW,
    requiredApprovals: [],
    approvalsPresent: [],
    ...overrides,
  };
}

describe("evaluator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("nonEmptyGate", () => {
    it("fails with EMPTY_RELEASE when tasks array is empty", () => {
      const res = nonEmptyGate(makeCtx({ tasks: [] }));
      expect(res.gate).toBe(GATE_NON_EMPTY);
      expect(res.state).toBe("failed");
      expect(res.blockers).toEqual([{ source: "system", reason: "EMPTY_RELEASE" }]);
    });

    it("passes when tasks are present", () => {
      const res = nonEmptyGate(makeCtx({ tasks: [makeTask()] }));
      expect(res.gate).toBe(GATE_NON_EMPTY);
      expect(res.state).toBe("passed");
      expect(res.summary).toBe("1 task(s) in release");
      expect(res.blockers).toHaveLength(0);
    });
  });

  describe("overrideIsActive", () => {
    it("returns false for non-overridable gates (non_empty_release and ci)", () => {
      expect(NON_OVERRIDABLE.has(GATE_NON_EMPTY)).toBe(true);
      expect(NON_OVERRIDABLE.has(GATE_CI)).toBe(true);

      const overrideNonEmpty: GateOverrideRow = {
        gate: GATE_NON_EMPTY,
        revokedAt: null,
        expiresAt: null,
        createdAt: NOW,
      };
      expect(overrideIsActive(overrideNonEmpty, NOW)).toBe(false);

      const overrideCi: GateOverrideRow = {
        gate: GATE_CI,
        revokedAt: null,
        expiresAt: null,
        createdAt: NOW,
      };
      expect(overrideIsActive(overrideCi, NOW)).toBe(false);
    });

    it("returns false when revokedAt is set", () => {
      const override: GateOverrideRow = {
        gate: "task_status",
        revokedAt: new Date(NOW.getTime() - 1000),
        expiresAt: null,
        createdAt: NOW,
      };
      expect(overrideIsActive(override, NOW)).toBe(false);
    });

    it("returns false when expiresAt is in the past or now", () => {
      const expired: GateOverrideRow = {
        gate: "task_status",
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() - 1000),
        createdAt: NOW,
      };
      expect(overrideIsActive(expired, NOW)).toBe(false);

      const expiresNow: GateOverrideRow = {
        gate: "task_status",
        revokedAt: null,
        expiresAt: NOW,
        createdAt: NOW,
      };
      expect(overrideIsActive(expiresNow, NOW)).toBe(false);
    });

    it("returns true for a valid, active override", () => {
      const active: GateOverrideRow = {
        gate: "task_status",
        revokedAt: null,
        expiresAt: new Date(NOW.getTime() + 60_000),
        createdAt: NOW,
      };
      expect(overrideIsActive(active, NOW)).toBe(true);
    });
  });

  describe("aggregateGates", () => {
    const passed = (gate: string): GateResult => ({
      gate,
      state: "passed",
      summary: "ok",
      blockers: [],
    });
    const failed = (gate: string): GateResult => ({
      gate,
      state: "failed",
      summary: "failed",
      blockers: [{ source: "jira", reason: "error" }],
    });
    const unknown = (gate: string): GateResult => ({
      gate,
      state: "unknown",
      summary: "unknown",
      blockers: [{ source: "bitbucket", reason: "pending" }],
    });

    it("marks blocked if any mandatory gate is failed", () => {
      expect(aggregateGates([passed("task_status"), failed("critical_bugs")])).toBe("blocked");
      expect(aggregateGates([failed("task_status"), unknown("pull_requests")])).toBe("blocked");
    });

    it("marks unknown if no failed gate but at least one mandatory gate is unknown", () => {
      expect(aggregateGates([passed("task_status"), unknown("pull_requests")])).toBe("unknown");
    });

    it("marks ready if all mandatory gates passed or overridden", () => {
      expect(
        aggregateGates([
          passed("task_status"),
          { gate: "critical_bugs", state: "overridden", summary: "overridden", blockers: [] },
        ])
      ).toBe("ready");
    });

    it("excludes AI advisory gate from aggregation (never blocks or ready-gates)", () => {
      expect(
        aggregateGates([
          passed("task_status"),
          { gate: GATE_AI_ADVISORY, state: "failed", summary: "ai failed", blockers: [] },
        ])
      ).toBe("ready");

      expect(
        aggregateGates([
          passed("task_status"),
          { gate: GATE_AI_ADVISORY, state: "unknown", summary: "ai unavailable", blockers: [] },
        ])
      ).toBe("ready");
    });
  });

  describe("collectBlockers", () => {
    it("flattens blockers from all gates", () => {
      const gates: GateResult[] = [
        {
          gate: "task_status",
          state: "failed",
          summary: "1 not done",
          blockers: [{ source: "jira", jiraKey: "EPM-1", reason: "In Progress" }],
        },
        {
          gate: "pull_requests",
          state: "unknown",
          summary: "1 open",
          blockers: [{ source: "bitbucket", reason: "Open PR" }],
        },
      ];

      const blockers = collectBlockers(gates);
      expect(blockers).toHaveLength(2);
      expect(blockers[0].jiraKey).toBe("EPM-1");
      expect(blockers[1].reason).toBe("Open PR");
    });
  });

  describe("evaluateReleaseGates", () => {
    it("evaluates clean release as ready with ready=true", async () => {
      const ctx = makeCtx();
      const evalRes = await evaluateReleaseGates(ctx, { now: NOW });

      expect(evalRes.status).toBe("ready");
      expect(evalRes.ready).toBe(true);
      expect(evalRes.blockers).toHaveLength(0);
      expect(evalRes.summary).toContain("non_empty_release=passed");
    });

    it("evaluates empty release as blocked and does not allow override of non_empty_release", async () => {
      const ctx = makeCtx({ tasks: [] });
      const overrides: GateOverrideRow[] = [
        {
          gate: GATE_NON_EMPTY,
          revokedAt: null,
          expiresAt: null,
          createdAt: NOW,
        },
      ];

      const evalRes = await evaluateReleaseGates(ctx, { overrides, now: NOW });

      expect(evalRes.status).toBe("blocked");
      expect(evalRes.ready).toBe(false);
      const nonEmpty = evalRes.gates.find((g) => g.gate === GATE_NON_EMPTY);
      expect(nonEmpty?.state).toBe("failed");
    });

    it("applies active override to overridable gates and turns blocked into ready", async () => {
      const ctx = makeCtx({
        tasks: [makeTask({ statusCategory: "indeterminate", status: "In Progress" })],
      });

      // Without override -> blocked
      const blockedRes = await evaluateReleaseGates(ctx, { now: NOW });
      expect(blockedRes.status).toBe("blocked");
      expect(blockedRes.ready).toBe(false);

      // With active override for task_status -> overridden -> ready
      const overrides: GateOverrideRow[] = [
        {
          gate: "task_status",
          revokedAt: null,
          expiresAt: null,
          createdAt: NOW,
          reason: "Approved exception for hotfix",
        },
      ];

      const overriddenRes = await evaluateReleaseGates(ctx, { overrides, now: NOW });
      expect(overriddenRes.status).toBe("ready");
      expect(overriddenRes.ready).toBe(true);

      const taskGate = overriddenRes.gates.find((g) => g.gate === "task_status");
      expect(taskGate?.state).toBe("overridden");
      expect(taskGate?.summary).toContain("(overridden)");
    });
  });
});
