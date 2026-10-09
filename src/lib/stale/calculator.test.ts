import { describe, expect, it } from "vitest";
import { computeStaleInsights, getIsoWeekStart } from "./calculator";
import type { StaleIssueRecord, StaleQueryParams } from "./types";

function createMockIssue(overrides: Partial<StaleIssueRecord> = {}): StaleIssueRecord {
  const now = new Date("2026-10-09T10:00:00.000Z");
  return {
    jiraKey: "TEST-1",
    projectKey: "TEST",
    summary: "Mock issue",
    status: "In Progress",
    statusCategory: "indeterminate",
    statusChangedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (stale)
    assigneeJira: "alice",
    type: "Task",
    priority: "Medium",
    points: 3,
    originalEstimateSeconds: 7200,
    timeSpent: 3600,
    dueDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days overdue
    createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    labels: ["flow-feature"],
    lastSyncedAt: now,
    fixVersionIds: ["v1"],
    fixVersionNames: ["1.0.0"],
    ...overrides,
  };
}

const DEFAULT_PARAMS: StaleQueryParams = {
  project: "TEST",
  projectList: ["TEST"],
  assignee: "",
  status: "",
  reason: "",
  severity: "",
};

describe("computeStaleInsights", () => {
  const refDate = new Date("2026-10-09T10:00:00.000Z");

  it("handles empty issues list gracefully", () => {
    const result = computeStaleInsights([], {
      allowedProjects: ["TEST"],
      params: DEFAULT_PARAMS,
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });

    expect(result.tasks).toEqual([]);
    expect(result.bottleneck).toEqual([]);
    expect(result.support).toEqual([]);
    expect(result.blocked).toEqual([]);
    expect(result.wip).toEqual([]);
    expect(result.trend).toHaveLength(8);
    expect(result.trend.every((t) => t.count === 0)).toBe(true);
    expect(result.filters.projects).toEqual(["TEST"]);
    expect(result.filters.assignees).toEqual([]);
    expect(result.filters.statuses).toEqual([]);
    expect(result.filters.reasons).toEqual([]);
    expect(result.summary).toEqual({
      totalActive: 0,
      totalStale: 0,
      totalHigh: 0,
      totalBlocked: 0,
      totalNoAssignee: 0,
      worstOverBy: 0,
      totalOverdue: 0,
      totalBaselineAlert: 0,
      wipCount: 0,
    });
    expect(result.myWork.totalActive).toBe(0);
    expect(result.myWork.totalStale).toBe(0);
    expect(result.myWork.wipCount).toBe(0);
    expect(result.myWork.lastSyncedAt).toBeNull();
    expect(result.myWork.standardization.complete).toBe(0);
    expect(result.myWork.standardization.incomplete).toBe(0);
    expect(result.myWork.standardization.tasks).toEqual([]);
  });

  it("calculates WIP tasks and per-assignee WIP breakdown", () => {
    const issues: StaleIssueRecord[] = [
      createMockIssue({ jiraKey: "TEST-1", status: "In Progress", assigneeJira: "alice" }),
      createMockIssue({ jiraKey: "TEST-2", status: "In Review", assigneeJira: "alice" }),
      createMockIssue({ jiraKey: "TEST-3", status: "In Progress", assigneeJira: "bob" }),
      createMockIssue({ jiraKey: "TEST-4", status: "To Do", assigneeJira: "charlie" }),
      createMockIssue({ jiraKey: "TEST-5", status: "In Progress", assigneeJira: null }),
    ];

    const result = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: DEFAULT_PARAMS,
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });

    expect(result.summary.wipCount).toBe(4); // TEST-1, TEST-2, TEST-3, TEST-5
    expect(result.wip).toEqual([
      { assignee: "alice", taskCount: 2, statuses: ["In Progress", "In Review"] },
      { assignee: "bob", taskCount: 1, statuses: ["In Progress"] },
      { assignee: "(unassigned)", taskCount: 1, statuses: ["In Progress"] },
    ]);
  });

  it("identifies stale tasks exceeding SLA, computes bottleneck, support and blocked tasks", () => {
    const issues: StaleIssueRecord[] = [
      // Stale task (in progress for 10 days, exceeds SLA of ~5 days)
      createMockIssue({
        jiraKey: "TEST-1",
        status: "In Progress",
        assigneeJira: "alice",
        statusChangedAt: new Date(refDate.getTime() - 10 * 24 * 60 * 60 * 1000),
      }),
      // Blocked task
      createMockIssue({
        jiraKey: "TEST-2",
        status: "Blocked",
        statusCategory: "indeterminate",
        assigneeJira: "bob",
        statusChangedAt: new Date(refDate.getTime() - 6 * 24 * 60 * 60 * 1000),
      }),
      // Fresh task (in progress for only 1 day, does NOT exceed SLA)
      createMockIssue({
        jiraKey: "TEST-3",
        status: "In Progress",
        assigneeJira: "charlie",
        statusChangedAt: new Date(refDate.getTime() - 1 * 24 * 60 * 60 * 1000),
      }),
    ];

    const result = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: DEFAULT_PARAMS,
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });

    expect(result.tasks).toHaveLength(2); // TEST-1 and TEST-2
    expect(result.tasks.map((t) => t.jiraKey)).toEqual(["TEST-1", "TEST-2"]);

    // Bottleneck by status
    expect(result.bottleneck.length).toBe(2);
    expect(result.bottleneck.find((b) => b.status === "In Progress")).toBeDefined();
    expect(result.bottleneck.find((b) => b.status === "Blocked")).toBeDefined();

    // Support entries
    expect(result.support.length).toBe(2);
    const aliceSupport = result.support.find((s) => s.assignee === "alice");
    expect(aliceSupport?.taskCount).toBe(1);

    // Blocked tasks list
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0].jiraKey).toBe("TEST-2");
    expect(result.blocked[0].status).toBe("Blocked");
    expect(result.blocked[0].blockedDays).toBeGreaterThan(0);
  });

  it("applies secondary filters (assignee, status, reason, severity)", () => {
    const issues: StaleIssueRecord[] = [
      createMockIssue({
        jiraKey: "TEST-1",
        status: "In Progress",
        assigneeJira: "alice",
        statusChangedAt: new Date(refDate.getTime() - 10 * 24 * 60 * 60 * 1000),
      }),
      createMockIssue({
        jiraKey: "TEST-2",
        status: "Blocked",
        statusCategory: "indeterminate",
        assigneeJira: "bob",
        statusChangedAt: new Date(refDate.getTime() - 10 * 24 * 60 * 60 * 1000),
      }),
      createMockIssue({
        jiraKey: "TEST-3",
        status: "In Progress",
        assigneeJira: null,
        statusChangedAt: new Date(refDate.getTime() - 10 * 24 * 60 * 60 * 1000),
      }),
    ];

    // Filter by assignee: bob
    const bobResult = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: { ...DEFAULT_PARAMS, assignee: "bob" },
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });
    expect(bobResult.tasks.map((t) => t.jiraKey)).toEqual(["TEST-2"]);

    // Filter by status: In Progress
    const inProgressResult = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: { ...DEFAULT_PARAMS, status: "In Progress" },
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });
    expect(inProgressResult.tasks.map((t) => t.jiraKey)).toEqual(["TEST-1", "TEST-3"]);

    // Filter by reason: no_assignee
    const noAssigneeResult = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: { ...DEFAULT_PARAMS, reason: "no_assignee" },
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });
    expect(noAssigneeResult.tasks.map((t) => t.jiraKey)).toEqual(["TEST-3"]);

    // Filter by severity: high (Blocked has high severity)
    const highResult = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: { ...DEFAULT_PARAMS, severity: "high" },
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });
    expect(highResult.tasks.map((t) => t.jiraKey)).toEqual(["TEST-2"]);
  });

  it("calculates trend buckets correctly", () => {
    const weekStart = getIsoWeekStart(refDate);
    const issues: StaleIssueRecord[] = [
      createMockIssue({
        jiraKey: "TEST-1",
        status: "In Progress",
        statusChangedAt: refDate,
      }),
    ];

    const result = computeStaleInsights(issues, {
      allowedProjects: ["TEST"],
      params: DEFAULT_PARAMS,
      myUsername: "alice",
      myAliases: ["alice"],
      now: refDate,
    });

    const currentWeekBucket = result.trend.find((t) => t.week === weekStart);
    expect(currentWeekBucket).toBeDefined();
    expect(result.trend).toHaveLength(8);
  });
});
