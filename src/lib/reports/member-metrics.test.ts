import { describe, it, expect } from "vitest";
import { calculateMemberMetrics } from "./member-metrics";
import type { ReportIssueInput } from "./metrics";

function makeIssue(partial: Partial<ReportIssueInput>): ReportIssueInput {
  return {
    jiraKey: "TEST-1",
    projectKey: "TEST",
    summary: "Task summary",
    status: "To Do",
    statusCategory: "new",
    statusChangedAt: null,
    assigneeJira: "alice",
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

describe("member-metrics (Section 2.5, Section 6.6)", () => {
  const from = "2026-09-28";
  const to = "2026-10-04";
  const timezone = "Asia/Ho_Chi_Minh";

  it("calculates contribution and current load without rank or scores", () => {
    const issues = [
      makeIssue({
        jiraKey: "T-1",
        assigneeJira: "alice",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-02T10:00:00Z"),
        points: 5,
      }),
      makeIssue({
        jiraKey: "T-2",
        assigneeJira: "alice",
        status: "In Progress",
        statusCategory: "indeterminate",
        points: 3,
      }),
      makeIssue({
        jiraKey: "T-3",
        assigneeJira: "bob",
        status: "Blocked",
        statusCategory: "indeterminate",
        statusChangedAt: new Date("2026-09-20T10:00:00Z"),
        points: 2,
      }),
    ];

    const prevCompletions = new Map([
      ["alice", 0],
      ["bob", 1],
    ]);

    const res = calculateMemberMetrics({
      issues,
      from,
      to,
      timezone,
      previousPeriodCompletions: prevCompletions,
    });

    const alice = res.find((m) => m.assignee === "alice");
    expect(alice).toBeDefined();
    expect(alice?.completedTasks).toBe(1);
    expect(alice?.completedPoints).toBe(5);
    expect(alice?.currentWip).toBe(1);
    expect(alice?.deltaCompletedTasks).toBe(1);
    expect(alice?.supportSignal).toBe("balanced");

    const bob = res.find((m) => m.assignee === "bob");
    expect(bob).toBeDefined();
    expect(bob?.completedTasks).toBe(0);
    expect(bob?.currentBlocked).toBe(1);
    expect(bob?.supportSignal).toBe("needs_unblock");
    expect(bob?.supportReasons[0]).toContain("bị tắc");
  });
});
