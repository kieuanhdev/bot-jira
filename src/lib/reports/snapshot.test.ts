import { describe, it, expect } from "vitest";
import { getMidnightDate, calculateSnapshotMetrics } from "./snapshot";
import type { ReportIssueInput } from "./metrics";

describe("Snapshot service", () => {
  describe("getMidnightDate", () => {
    it("normalizes a date in UTC to start of day in Asia/Ho_Chi_Minh (+07:00)", () => {
      // 2026-10-03 at 15:30 UTC is 2026-10-03 22:30 in VN -> 2026-10-03T00:00:00.000Z
      const date = new Date("2026-10-03T15:30:00.000Z");
      const midnight = getMidnightDate(date, "Asia/Ho_Chi_Minh");
      expect(midnight.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    });

    it("handles next day crossing in Vietnam timezone", () => {
      // 2026-10-03 at 18:00 UTC is 2026-10-04 01:00 in VN -> 2026-10-04T00:00:00.000Z
      const date = new Date("2026-10-03T18:00:00.000Z");
      const midnight = getMidnightDate(date, "Asia/Ho_Chi_Minh");
      expect(midnight.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    });
  });

  describe("calculateSnapshotMetrics", () => {
    it("accurately computes counts, points, estimates, and risk flags", () => {
      const now = new Date("2026-10-03T12:00:00.000Z");
      const pastDueDate = new Date("2026-10-01T12:00:00.000Z");
      const futureDueDate = new Date("2026-10-10T12:00:00.000Z");
      // 10 business days ago status update
      const longAgoStatus = new Date("2026-09-15T12:00:00.000Z");

      const issues: ReportIssueInput[] = [
        {
          jiraKey: "TEST-1",
          projectKey: "TEST",
          summary: "Done task",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: null,
          assigneeJira: "alice",
          priority: "Medium",
          points: 5,
          originalEstimateSeconds: 3600,
          timeSpent: null,
          dueDate: null,
          createdAt: now,
          updatedAt: now,
          labels: [],
        },
        {
          jiraKey: "TEST-2",
          projectKey: "TEST",
          summary: "Blocked task",
          status: "Blocked",
          statusCategory: "indeterminate",
          statusChangedAt: longAgoStatus,
          assigneeJira: null, // unassigned
          priority: "High",
          points: 3,
          originalEstimateSeconds: 7200,
          timeSpent: null,
          dueDate: pastDueDate, // overdue
          createdAt: longAgoStatus,
          updatedAt: now,
          labels: [],
        },
        {
          jiraKey: "TEST-3",
          projectKey: "TEST",
          summary: "In progress task",
          status: "In Progress",
          statusCategory: "indeterminate",
          statusChangedAt: now,
          assigneeJira: "bob",
          priority: "Low",
          points: 8,
          originalEstimateSeconds: 14400,
          timeSpent: null,
          dueDate: futureDueDate,
          createdAt: now,
          updatedAt: now,
          labels: [],
        },
      ];

      const metrics = calculateSnapshotMetrics(issues, now);

      expect(metrics.totalCount).toBe(3);
      expect(metrics.doneCount).toBe(1);
      expect(metrics.totalPoints).toBe(16);
      expect(metrics.donePoints).toBe(5);
      expect(metrics.totalEstimateSeconds).toBe(25200);
      expect(metrics.doneEstimateSeconds).toBe(3600);
      expect(metrics.blockedCount).toBe(1);
      expect(metrics.overdueCount).toBe(1);
      expect(metrics.overSlaCount).toBe(1);
      expect(metrics.unassignedCount).toBe(1);
      expect(metrics.unit).toBe("points");
      expect(metrics.statusGroups["Done"]?.count).toBe(1);
      expect(metrics.statusGroups["Blocked"]?.count).toBe(1);
      expect(metrics.statusGroups["In Progress"]?.count).toBe(1);
    });

    it("handles empty issues list cleanly", () => {
      const metrics = calculateSnapshotMetrics([]);
      expect(metrics.totalCount).toBe(0);
      expect(metrics.doneCount).toBe(0);
      expect(metrics.totalPoints).toBeNull();
      expect(metrics.donePoints).toBeNull();
      expect(metrics.totalEstimateSeconds).toBeNull();
      expect(metrics.doneEstimateSeconds).toBeNull();
      expect(metrics.blockedCount).toBe(0);
      expect(metrics.overdueCount).toBe(0);
      expect(metrics.overSlaCount).toBe(0);
      expect(metrics.unassignedCount).toBe(0);
      expect(metrics.unit).toBe("tasks");
    });
  });
});
