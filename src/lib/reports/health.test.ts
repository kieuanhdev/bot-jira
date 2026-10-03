import { describe, it, expect } from "vitest";
import { calculateProjectHealth } from "./health";
import type { ReportIssueInput } from "./metrics";
import type { ProgressMetric, ReportFreshness } from "./types";

function makeIssue(partial: Partial<ReportIssueInput>): ReportIssueInput {
  return {
    jiraKey: "PRJ-1",
    projectKey: "PRJ",
    summary: "Task summary",
    status: "To Do",
    statusCategory: "new",
    statusChangedAt: new Date("2026-10-01T00:00:00Z"),
    assigneeJira: "alice",
    priority: "Medium",
    points: 3,
    originalEstimateSeconds: 7200,
    timeSpent: 0,
    dueDate: new Date("2026-10-20T00:00:00Z"),
    createdAt: new Date("2026-09-20T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    labels: [],
    ...partial,
  };
}

const freshFreshness: ReportFreshness = {
  status: "healthy",
  isFresh: true,
  workerAgeMs: 5000,
  jiraSyncAgeMs: 10000,
  lastSyncedAt: new Date().toISOString(),
};

const staleFreshness: ReportFreshness = {
  status: "degraded",
  isFresh: false,
  workerAgeMs: 5000,
  jiraSyncAgeMs: 900000,
  lastSyncedAt: new Date().toISOString(),
  warning: "Jira sync is stale",
};

describe("calculateProjectHealth (Section 5.9, RPT-102)", () => {
  const now = new Date("2026-10-05T00:00:00Z");

  it("Rule 1: evaluates unknown when freshness is stale", () => {
    const issues = [makeIssue({ status: "In Progress" })];
    const progress: ProgressMetric = { percentage: 50, done: 1, total: 2, unit: "tasks" };

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: staleFreshness,
      releaseDate: new Date("2026-10-20T00:00:00Z"),
      now,
    });

    expect(res.status).toBe("unknown");
    expect(res.reasons.some((r) => r.code === "STALE_SOURCE")).toBe(true);
  });

  it("Rule 1: evaluates unknown when scope is empty", () => {
    const progress: ProgressMetric = { percentage: null, done: 0, total: 0, unit: "tasks" };

    const res = calculateProjectHealth({
      issues: [],
      progress,
      freshness: freshFreshness,
      releaseDate: new Date("2026-10-20T00:00:00Z"),
      now,
    });

    expect(res.status).toBe("unknown");
    expect(res.reasons.some((r) => r.code === "EMPTY_SCOPE")).toBe(true);
  });

  it("Rule 2: evaluates completed when 100% done and no open tasks", () => {
    const issues = [
      makeIssue({ jiraKey: "P-1", status: "Done", statusCategory: "done" }),
      makeIssue({ jiraKey: "P-2", status: "Closed", statusCategory: "done" }),
    ];
    const progress: ProgressMetric = { percentage: 100, done: 2, total: 2, unit: "tasks" };

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: freshFreshness,
      releaseDate: new Date("2026-10-20T00:00:00Z"),
      now,
    });

    expect(res.status).toBe("completed");
    expect(res.reasons.some((r) => r.code === "ALL_DONE")).toBe(true);
  });

  it("Rule 3: evaluates at_risk when deadline passed and remaining open tasks", () => {
    const issues = [makeIssue({ status: "In Progress", statusCategory: "indeterminate" })];
    const progress: ProgressMetric = { percentage: 50, done: 1, total: 2, unit: "tasks" };
    const pastRelease = new Date("2026-10-01T00:00:00Z"); // earlier than `now`

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: freshFreshness,
      releaseDate: pastRelease,
      now,
    });

    expect(res.status).toBe("at_risk");
    expect(res.reasons.some((r) => r.code === "DEADLINE_PASSED")).toBe(true);
  });

  it("Rule 3: evaluates at_risk when deadline is <= 7 days away and progress < 70%", () => {
    const issues = [makeIssue({ status: "In Progress", statusCategory: "indeterminate" })];
    const progress: ProgressMetric = { percentage: 40, done: 2, total: 5, unit: "tasks" };
    const closeRelease = new Date("2026-10-10T00:00:00Z"); // 5 days from `now`

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: freshFreshness,
      releaseDate: closeRelease,
      now,
    });

    expect(res.status).toBe("at_risk");
    expect(res.reasons.some((r) => r.code === "DEADLINE_IMMINENT_LOW_PROGRESS")).toBe(true);
  });

  it("Rule 3: evaluates at_risk when schedule gap > 20 percentage points", () => {
    const issues = [makeIssue({ status: "In Progress", statusCategory: "indeterminate" })];
    const progress: ProgressMetric = { percentage: 30, done: 3, total: 10, unit: "tasks" };

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: freshFreshness,
      releaseDate: new Date("2026-10-30T00:00:00Z"),
      scheduleGapPercentage: 25, // > 20%
      now,
    });

    expect(res.status).toBe("at_risk");
    expect(res.reasons.some((r) => r.code === "SCHEDULE_GAP_CRITICAL")).toBe(true);
  });

  it("Rule 4: evaluates attention when there are blocked or overdue tasks", () => {
    const issues = [
      makeIssue({
        jiraKey: "P-1",
        status: "Blocked",
        statusCategory: "indeterminate",
        statusChangedAt: now, // 0 days in state, not yet exceeding SLA
        dueDate: new Date("2026-10-01T00:00:00Z"), // overdue relative to `now`
      }),
    ];
    const progress: ProgressMetric = { percentage: 50, done: 1, total: 2, unit: "tasks" };

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: freshFreshness,
      releaseDate: new Date("2026-10-30T00:00:00Z"),
      now,
    });

    expect(res.status).toBe("attention");
    expect(res.reasons.some((r) => r.code === "HAS_BLOCKED_TASKS")).toBe(true);
    expect(res.reasons.some((r) => r.code === "HAS_OVERDUE_TASKS")).toBe(true);
  });

  it("Rule 5: evaluates healthy when on track and no alerts", () => {
    const issues = [
      makeIssue({
        status: "In Progress",
        statusCategory: "indeterminate",
        dueDate: new Date("2026-10-25T00:00:00Z"),
      }),
    ];
    const progress: ProgressMetric = { percentage: 60, done: 3, total: 5, unit: "tasks" };

    const res = calculateProjectHealth({
      issues,
      progress,
      freshness: freshFreshness,
      releaseDate: new Date("2026-10-30T00:00:00Z"),
      scheduleGapPercentage: 5,
      now,
    });

    expect(res.status).toBe("healthy");
    expect(res.reasons.some((r) => r.code === "ON_TRACK")).toBe(true);
  });
});
