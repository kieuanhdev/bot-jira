import { describe, expect, it } from "vitest";
import type { MemberReportItem } from "@/lib/reports/types";
import { buildMemberWorkloadReport, buildIndividualMemberAnalysis } from "./member-workload-model";

function member(partial: Partial<MemberReportItem>): MemberReportItem {
  return {
    assignee: "alice",
    displayName: "Alice",
    completedTasks: 0,
    completedPoints: 0,
    completedEstimateSeconds: 0,
    currentWip: 0,
    currentBlocked: 0,
    currentOverdue: 0,
    currentOverSla: 0,
    assignedOpenTasks: 0,
    supportSignal: "balanced",
    supportReasons: [],
    ...partial,
  };
}

describe("member-workload-model", () => {
  it("builds sorted workload distribution and report summary", () => {
    const result = buildMemberWorkloadReport([
      member({ completedTasks: 3, assignedOpenTasks: 2, currentWip: 1 }),
      member({
        assignee: "bob",
        displayName: "Bob",
        completedTasks: 1,
        assignedOpenTasks: 4,
        currentWip: 3,
        currentBlocked: 1,
        supportSignal: "needs_unblock",
      }),
      member({
        assignee: "unassigned",
        displayName: "Chưa phân công",
        assignedOpenTasks: 2,
      }),
    ]);

    expect(result.summary).toMatchObject({
      memberCount: 2,
      totalTasks: 12,
      completedTasks: 4,
      currentWip: 4,
      blockedTasks: 1,
      needsSupportCount: 1,
    });
    expect(result.items.map((item) => item.assignee)).toEqual(["alice", "bob", "unassigned"]);
    expect(result.items[0].percentage).toBe(41.7);
    expect(result.items[2].percentage).toBe(16.7);
  });

  it("handles an empty report", () => {
    expect(buildMemberWorkloadReport([])).toEqual({
      items: [],
      summary: {
        memberCount: 0,
        totalTasks: 0,
        completedTasks: 0,
        currentWip: 0,
        blockedTasks: 0,
        needsSupportCount: 0,
      },
    });
  });

  describe("buildIndividualMemberAnalysis", () => {
    it("computes workload composition, operational metrics, and effort summary", () => {
      const testMember = member({
        assignee: "alice",
        displayName: "Alice",
        completedTasks: 8,
        completedPoints: 24,
        completedEstimateSeconds: 72000, // 20 hours
        assignedOpenTasks: 4,
        currentWip: 2,
        currentBlocked: 1,
        currentOverdue: 0,
        currentOverSla: 0,
        deltaCompletedTasks: 2,
        supportSignal: "balanced",
      });

      const analysis = buildIndividualMemberAnalysis(testMember);

      expect(analysis.totalTasks).toBe(12);
      expect(analysis.completionRate).toBe(67);
      expect(analysis.composition).toHaveLength(4);

      // Check composition items
      const doneItem = analysis.composition.find((c) => c.key === "done");
      const wipItem = analysis.composition.find((c) => c.key === "wip");
      const blockedItem = analysis.composition.find((c) => c.key === "blocked");
      const todoItem = analysis.composition.find((c) => c.key === "todo");

      expect(doneItem?.count).toBe(8);
      expect(wipItem?.count).toBe(2);
      expect(blockedItem?.count).toBe(1);
      expect(todoItem?.count).toBe(1); // 4 - 2 - 1 = 1

      expect(analysis.effortSummary.completedHours).toBe(20);
      expect(analysis.effortSummary.avgHoursPerTask).toBe(2.5);
      expect(analysis.effortSummary.avgPointsPerTask).toBe(3);
      expect(analysis.effortSummary.deltaCompletedTasks).toBe(2);

      expect(analysis.operationalMetrics).toHaveLength(5);
      expect(analysis.healthScore).toBeGreaterThan(0);
      expect(analysis.healthAssessment.status).toBe("optimal");
    });

    it("evaluates blocked / overdue support signals correctly", () => {
      const blockedMember = member({
        assignee: "bob",
        displayName: "Bob",
        completedTasks: 2,
        assignedOpenTasks: 6,
        currentWip: 4,
        currentBlocked: 2,
        currentOverdue: 1,
        currentOverSla: 2,
        supportSignal: "needs_unblock",
        supportReasons: ["Có 2 việc bị tắc", "Có 1 việc quá hạn"],
      });

      const analysis = buildIndividualMemberAnalysis(blockedMember);

      expect(analysis.totalTasks).toBe(8);
      expect(analysis.completionRate).toBe(25);
      expect(analysis.healthAssessment.status).toBe("action_needed");
      expect(analysis.healthAssessment.title).toContain("Cần hỗ trợ");
    });
  });
});
