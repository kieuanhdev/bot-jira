import { describe, it, expect } from "vitest";
import {
  calculateCoverage,
  resolveEffectiveUnit,
  calculateProgress,
  calculateStatusDistribution,
  calculateWorkload,
  calculateBottlenecks,
  calculateTimeElapsedAndGap,
  type ReportIssueInput,
} from "./metrics";

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
    dueDate: new Date("2026-10-15T00:00:00Z"),
    createdAt: new Date("2026-09-20T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    labels: [],
    ...partial,
  };
}

describe("Reporting Metrics (Section 5.3 & 2.3, RPT-101)", () => {
  it("calculates coverage and recommends unit by 80% threshold", () => {
    // 5 issues: 4 with points (80%), 1 without points
    const issues = [
      makeIssue({ jiraKey: "P-1", points: 2, originalEstimateSeconds: null }),
      makeIssue({ jiraKey: "P-2", points: 3, originalEstimateSeconds: null }),
      makeIssue({ jiraKey: "P-3", points: 5, originalEstimateSeconds: 3600 }),
      makeIssue({ jiraKey: "P-4", points: 8, originalEstimateSeconds: null }),
      makeIssue({ jiraKey: "P-5", points: null, originalEstimateSeconds: null }),
    ];

    const cov = calculateCoverage(issues);
    expect(cov.pointsCoverage).toBe(80);
    expect(cov.estimateCoverage).toBe(20);
    expect(cov.recommendedUnit).toBe("points");

    // Resolves auto to recommended unit
    expect(resolveEffectiveUnit("auto", cov)).toBe("points");
    // Explicit override preserves user's choice
    expect(resolveEffectiveUnit("tasks", cov)).toBe("tasks");
  });

  it("falls back to tasks when coverage is below 80%", () => {
    const issues = [
      makeIssue({ jiraKey: "P-1", points: 2, originalEstimateSeconds: null }),
      makeIssue({ jiraKey: "P-2", points: null, originalEstimateSeconds: 3600 }),
      makeIssue({ jiraKey: "P-3", points: null, originalEstimateSeconds: null }),
    ];

    const cov = calculateCoverage(issues);
    expect(cov.pointsCoverage).toBe(33);
    expect(cov.estimateCoverage).toBe(33);
    expect(cov.recommendedUnit).toBe("tasks");
    expect(resolveEffectiveUnit("auto", cov)).toBe("tasks");
  });

  it("calculates progress for tasks, points, and estimate", () => {
    const issues = [
      makeIssue({ jiraKey: "P-1", status: "Done", statusCategory: "done", points: 5, originalEstimateSeconds: 7200 }),
      makeIssue({ jiraKey: "P-2", status: "In Progress", statusCategory: "indeterminate", points: 3, originalEstimateSeconds: 3600 }),
      makeIssue({ jiraKey: "P-3", status: "To Do", statusCategory: "new", points: 2, originalEstimateSeconds: 3600 }),
    ];

    // Tasks: 1 done / 3 total = 33%
    const taskProg = calculateProgress(issues, "tasks");
    expect(taskProg.done).toBe(1);
    expect(taskProg.total).toBe(3);
    expect(taskProg.percentage).toBe(33);

    // Points: 5 done / 10 total = 50%
    const pointProg = calculateProgress(issues, "points");
    expect(pointProg.done).toBe(5);
    expect(pointProg.total).toBe(10);
    expect(pointProg.percentage).toBe(50);

    // Estimate: 7200s (2h) done / 14400s (4h) total = 50%
    const estProg = calculateProgress(issues, "estimate");
    expect(estProg.done).toBe(2);
    expect(estProg.total).toBe(4);
    expect(estProg.percentage).toBe(50);
  });

  it("returns null percentage for empty scope or 0 total denominator", () => {
    const prog = calculateProgress([], "tasks");
    expect(prog.percentage).toBeNull();
    expect(prog.total).toBe(0);

    const issuesWithoutPoints = [
      makeIssue({ jiraKey: "P-1", points: null }),
      makeIssue({ jiraKey: "P-2", points: 0 }),
    ];
    const pointProg = calculateProgress(issuesWithoutPoints, "points");
    expect(pointProg.percentage).toBeNull();
  });

  it("aggregates status distribution correctly", () => {
    const issues = [
      makeIssue({ jiraKey: "P-1", status: "Done", points: 5 }),
      makeIssue({ jiraKey: "P-2", status: "In Progress", points: 3 }),
      makeIssue({ jiraKey: "P-3", status: "In Review", points: 2 }),
      makeIssue({ jiraKey: "P-4", status: "Blocked", points: 1 }),
    ];

    const dist = calculateStatusDistribution(issues);
    const doneItem = dist.find((d) => d.group === "Done")!;
    expect(doneItem.count).toBe(1);
    expect(doneItem.points).toBe(5);
    expect(doneItem.percentage).toBe(25);

    const blockedItem = dist.find((d) => d.group === "Blocked")!;
    expect(blockedItem.count).toBe(1);
    expect(blockedItem.points).toBe(1);
  });

  it("filters out past completed tasks when periodStartStr is provided", () => {
    const issues = [
      // Completed during the period (2026-09-28 to 2026-10-04)
      makeIssue({
        jiraKey: "P-1",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-02T10:00:00Z"),
        points: 5,
      }),
      // Completed long before the period (e.g. May 2026)
      makeIssue({
        jiraKey: "P-OLD",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-05-10T10:00:00Z"),
        points: 10,
      }),
      // Open during the period
      makeIssue({
        jiraKey: "P-2",
        status: "In Progress",
        statusCategory: "indeterminate",
        points: 3,
      }),
    ];

    const dist = calculateStatusDistribution(issues, "2026-10-04", "2026-09-28");
    const doneItem = dist.find((d) => d.group === "Done")!;
    // Only P-1 should be in Done, P-OLD should be excluded
    expect(doneItem.count).toBe(1);
    expect(doneItem.points).toBe(5);

    const inProgItem = dist.find((d) => d.group === "In Progress")!;
    expect(inProgItem.count).toBe(1);

    // Total active tasks in period = 2 (50% each), not 3
    expect(doneItem.percentage).toBe(50);
    expect(inProgItem.percentage).toBe(50);
  });

  it("aggregates workload by assignee without personal score or ranking", () => {
    const issues = [
      makeIssue({ jiraKey: "P-1", assigneeJira: "alice", status: "Done" }),
      makeIssue({ jiraKey: "P-2", assigneeJira: "alice", status: "In Progress" }),
      makeIssue({ jiraKey: "P-3", assigneeJira: "bob", status: "Blocked" }),
      makeIssue({ jiraKey: "P-4", assigneeJira: null, status: "To Do" }),
    ];

    const workload = calculateWorkload(issues, new Date("2026-10-02T00:00:00Z"));
    expect(workload.length).toBe(3); // alice, bob, unassigned

    const alice = workload.find((w) => w.assignee === "alice")!;
    expect(alice.totalTasks).toBe(2);
    expect(alice.doneTasks).toBe(1);
    expect(alice.inProgressTasks).toBe(1);

    const bob = workload.find((w) => w.assignee === "bob")!;
    expect(bob.blockedTasks).toBe(1);

    const unassigned = workload.find((w) => w.assignee === "unassigned")!;
    expect(unassigned.totalTasks).toBe(1);
  });

  it("calculates time elapsed and schedule gap", () => {
    const start = new Date("2026-10-01T00:00:00Z"); // Thursday
    const release = new Date("2026-10-15T00:00:00Z"); // Thursday (11 business days total)
    const now = new Date("2026-10-08T00:00:00Z"); // Thursday (6 business days passed: ~55%)

    const { timeElapsedPercentage, scheduleGapPercentage } = calculateTimeElapsedAndGap(
      start,
      release,
      40, // 40% progress
      now
    );

    expect(timeElapsedPercentage).toBe(55);
    expect(scheduleGapPercentage).toBe(15); // 55% - 40% = 15% gap
  });

  it("calculates bottlenecks by status", () => {
    const issues = [
      makeIssue({ jiraKey: "P-1", status: "In Progress", statusCategory: "indeterminate" }),
      makeIssue({ jiraKey: "P-2", status: "In Progress", statusCategory: "indeterminate" }),
      makeIssue({ jiraKey: "P-3", status: "Done", statusCategory: "done" }),
    ];

    const bottlenecks = calculateBottlenecks(issues, new Date("2026-10-10T00:00:00Z"));
    expect(bottlenecks.length).toBe(1);
    expect(bottlenecks[0].status).toBe("In Progress");
    expect(bottlenecks[0].taskCount).toBe(2);
  });
});
