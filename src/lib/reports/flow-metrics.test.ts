import { describe, it, expect } from "vitest";
import { calculateFlowMetrics, compareFlowMetrics } from "./flow-metrics";
import type { ReportIssueInput } from "./metrics";

function makeIssue(partial: Partial<ReportIssueInput>): ReportIssueInput {
  return {
    jiraKey: "TEST-1",
    projectKey: "TEST",
    summary: "Test summary",
    status: "To Do",
    statusCategory: "new",
    statusChangedAt: null,
    assigneeJira: "user1",
    priority: "Medium",
    points: 3,
    originalEstimateSeconds: 3600,
    timeSpent: 0,
    dueDate: null,
    createdAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-01T08:00:00Z"),
    labels: [],
    ...partial,
  };
}

describe("flow-metrics", () => {
  it("computes created and completed in period with net backlog change", () => {
    const issues = [
      // Created in period, not completed
      makeIssue({
        jiraKey: "TEST-1",
        createdAt: new Date("2026-09-30T10:00:00Z"),
        status: "In Progress",
      }),
      // Created before period, completed in period
      makeIssue({
        jiraKey: "TEST-2",
        createdAt: new Date("2026-08-01T10:00:00Z"),
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-02T10:00:00Z"),
      }),
      // Created in period and completed in period
      makeIssue({
        jiraKey: "TEST-3",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-03T10:00:00Z"),
      }),
      // Outside period
      makeIssue({
        jiraKey: "TEST-4",
        createdAt: new Date("2026-05-01T10:00:00Z"),
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-05-10T10:00:00Z"),
      }),
    ];

    const { flow } = calculateFlowMetrics({
      issues,
      from: "2026-09-28",
      to: "2026-10-04",
      timezone: "Asia/Ho_Chi_Minh",
      unit: "tasks",
    });

    expect(flow.createdInPeriod).toBe(2); // TEST-1, TEST-3
    expect(flow.completedInPeriod).toBe(2); // TEST-2, TEST-3
    expect(flow.netBacklogChange).toBe(0); // 2 - 2
    expect(flow.throughput).toBe(2);
  });

  it("compares flow metrics between two periods", () => {
    const curr = {
      createdInPeriod: 10,
      completedInPeriod: 8,
      reopenedInPeriod: 0,
      statusTransitionsInPeriod: 15,
      throughput: 8,
      throughputPoints: 24,
      throughputEstimateHours: 16,
      netBacklogChange: 2,
    };

    const prev = {
      createdInPeriod: 5,
      completedInPeriod: 4,
      reopenedInPeriod: 1,
      statusTransitionsInPeriod: 8,
      throughput: 4,
      throughputPoints: 12,
      throughputEstimateHours: 8,
      netBacklogChange: 1,
    };

    const comp = compareFlowMetrics(curr, prev);
    expect(comp.created.delta).toBe(5);
    expect(comp.created.percentChange).toBe(100);
    expect(comp.completed.delta).toBe(4);
    expect(comp.completed.percentChange).toBe(100);
    expect(comp.netBacklog.delta).toBe(1);
  });
});
