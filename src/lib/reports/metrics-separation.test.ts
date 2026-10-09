import { describe, it, expect } from "vitest";
import { calculateProjectReportMetrics } from "./project-metrics";
import {
  calculatePortfolioProjectSummary,
  calculatePortfolioRollup,
} from "./portfolio-metrics";
import { calculateHistoryMetrics } from "./history-metrics";
import { evaluateTaskExplorerItems } from "./task-calculator";
import { getMidnightDate, calculateSnapshotMetrics } from "./snapshot";
import { calculateFlowMetrics } from "./flow-metrics";
import { calculateMemberMetrics } from "./member-metrics";
import { calculateProjectHealth } from "./health";
import { isDateInPeriod } from "./completion-date";
import type { ReportIssueInput } from "./metrics";
import type { ReportPeriod, ReportFreshness } from "./types";
import type { RawReportTaskRecord } from "./query-primitives";

const mockFreshness: ReportFreshness = {
  status: "healthy",
  isFresh: true,
  workerAgeMs: 5000,
  jiraSyncAgeMs: 10000,
  lastSyncedAt: "2026-10-09T06:00:00.000Z",
};

const samplePeriod: ReportPeriod = {
  from: "2026-10-01",
  to: "2026-10-07",
  timezone: "Asia/Ho_Chi_Minh",
  preset: "custom",
};

function makeIssue(partial: Partial<ReportIssueInput> = {}): ReportIssueInput {
  return {
    jiraKey: "TEST-1",
    projectKey: "TEST",
    summary: "Sample issue",
    status: "In Progress",
    statusCategory: "indeterminate",
    statusChangedAt: new Date("2026-10-02T10:00:00.000Z"),
    assigneeJira: "dev1",
    priority: "Medium",
    points: 3,
    originalEstimateSeconds: 3600,
    timeSpent: 0,
    dueDate: new Date("2026-10-05T00:00:00.000Z"),
    createdAt: new Date("2026-10-01T08:00:00.000Z"),
    updatedAt: new Date("2026-10-02T10:00:00.000Z"),
    labels: [],
    ...partial,
  };
}

describe("Batch 6.2 - Metrics Separation, Timezone & Empty Data", () => {
  describe("Empty Data Handling", () => {
    it("calculateProjectReportMetrics handles completely empty issues dataset", () => {
      const result = calculateProjectReportMetrics({
        mappedIssues: [],
        period: samplePeriod,
        freshness: mockFreshness,
        now: new Date("2026-10-08T12:00:00.000Z"),
      });

      expect(result.coverage.pointsCoverage).toBe(0);
      expect(result.coverage.estimateCoverage).toBe(0);
      expect(result.coverage.recommendedUnit).toBe("tasks");
      expect(result.effectiveUnit).toBe("tasks");

      expect(result.flow.createdInPeriod).toBe(0);
      expect(result.flow.completedInPeriod).toBe(0);
      expect(result.flow.throughput).toBe(0);

      expect(result.snapshotAtEnd.totalAtEnd).toBe(0);
      expect(result.snapshotAtEnd.doneAtEnd).toBe(0);
      expect(result.snapshotAtEnd.openAtEnd).toBe(0);
      expect(result.snapshotAtEnd.completionRatio).toBe(0);

      expect(result.progress.percentage).toBeNull();
      expect(result.progress.total).toBe(0);
      expect(result.progress.done).toBe(0);

      expect(result.health.status).toBe("unknown");
      expect(result.health.reasons.some((r) => r.code === "EMPTY_SCOPE")).toBe(true);

      expect(result.statusDistribution.length).toBe(8);
      expect(result.statusDistribution.every((s) => s.count === 0 && s.percentage === 0)).toBe(true);
      expect(result.workload).toEqual([]);
      expect(result.bottlenecks).toEqual([]);
      expect(result.topRisks).toEqual([]);
    });

    it("calculatePortfolioRollup handles empty project summaries list", () => {
      const rollup = calculatePortfolioRollup([]);
      expect(rollup.projects).toEqual([]);
      expect(rollup.summary.total).toBe(0);
      expect(rollup.summary.totalProjects).toBe(0);
      expect(rollup.summary.healthy).toBe(0);
      expect(rollup.summary.attention).toBe(0);
      expect(rollup.summary.atRisk).toBe(0);
      expect(rollup.summary.completed).toBe(0);
      expect(rollup.summary.unknown).toBe(0);
      expect(rollup.summary.completedInPeriod).toBe(0);
      expect(rollup.summary.blockedAtEnd).toBe(0);
    });

    it("calculatePortfolioProjectSummary handles project with zero issues", () => {
      const summary = calculatePortfolioProjectSummary({
        projectKey: "PRJ",
        projectName: "Test Project",
        period: samplePeriod,
        periodLabel: "01/10 - 07/10",
        mappedIssues: [],
        freshness: mockFreshness,
        now: new Date("2026-10-08T12:00:00.000Z"),
      });

      expect(summary.totalTasks).toBe(0);
      expect(summary.doneTasks).toBe(0);
      expect(summary.health).toBe("unknown");
      expect(summary.progress.percentage).toBeNull();
      expect(summary.createdInPeriod).toBe(0);
      expect(summary.completedInPeriod).toBe(0);
    });

    it("calculateHistoryMetrics handles empty issues list with appropriate warning", () => {
      const result = calculateHistoryMetrics({
        issues: [],
        period: samplePeriod,
      });

      expect(result.dataSufficiencyWarning).toBe("Chưa có dữ liệu task trong phạm vi được chọn.");
      expect(result.dataPoints.length).toBe(7); // 7 daily points in 10-01 to 10-07
      expect(result.dataPoints.every((p) => p.createdCount === 0 && p.completedCount === 0)).toBe(true);
      expect(result.dataPoints.every((p) => p.openCount === 0 && p.doneCount === 0)).toBe(true);
    });

    it("calculateHistoryMetrics handles issues with zero events in the period", () => {
      const oldIssue = makeIssue({
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-08-10T00:00:00.000Z"),
      });

      const result = calculateHistoryMetrics({
        issues: [oldIssue],
        period: samplePeriod,
      });

      expect(result.dataSufficiencyWarning).toBe(
        "Không có sự kiện tạo mới hoặc hoàn thành nào trong khoảng thời gian này."
      );
    });

    it("evaluateTaskExplorerItems handles empty issues input", () => {
      const result = evaluateTaskExplorerItems([], {
        period: samplePeriod,
      });

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("calculateSnapshotMetrics in snapshot.ts handles empty list", () => {
      const metrics = calculateSnapshotMetrics([]);
      expect(metrics.totalCount).toBe(0);
      expect(metrics.doneCount).toBe(0);
      expect(metrics.totalPoints).toBeNull();
      expect(metrics.donePoints).toBeNull();
      expect(metrics.blockedCount).toBe(0);
      expect(metrics.overdueCount).toBe(0);
      expect(metrics.unit).toBe("tasks");
    });

    it("calculateMemberMetrics handles empty issues input", () => {
      const members = calculateMemberMetrics({
        issues: [],
        from: samplePeriod.from,
        to: samplePeriod.to,
        timezone: samplePeriod.timezone,
      });

      expect(members).toEqual([]);
    });

    it("calculateFlowMetrics handles empty issues and events", () => {
      const flow = calculateFlowMetrics({
        issues: [],
        from: samplePeriod.from,
        to: samplePeriod.to,
        timezone: samplePeriod.timezone,
        unit: "tasks",
      });

      expect(flow.flow.createdInPeriod).toBe(0);
      expect(flow.flow.completedInPeriod).toBe(0);
      expect(flow.flow.throughput).toBe(0);
      expect(flow.flow.netBacklogChange).toBe(0);
      expect(flow.createdIssueKeys.size).toBe(0);
      expect(flow.completedIssueKeys.size).toBe(0);
    });

    it("calculateProjectHealth handles empty scope", () => {
      const health = calculateProjectHealth({
        issues: [],
        progress: { percentage: null, done: 0, total: 0, unit: "tasks" },
        freshness: mockFreshness,
      });

      expect(health.status).toBe("unknown");
      expect(health.reasons[0].code).toBe("EMPTY_SCOPE");
    });
  });

  describe("Timezone Boundary Handling", () => {
    it("getMidnightDate normalizes correctly across various global timezones", () => {
      // 2026-10-05 at 16:30:00 UTC
      const date = new Date("2026-10-05T16:30:00.000Z");

      // In UTC (+0): 2026-10-05 16:30 -> 2026-10-05T00:00:00.000Z
      const utcMidnight = getMidnightDate(date, "UTC");
      expect(utcMidnight.toISOString()).toBe("2026-10-05T00:00:00.000Z");

      // In Asia/Ho_Chi_Minh (+7): 2026-10-05 23:30 -> 2026-10-05T00:00:00.000Z
      const vnMidnight = getMidnightDate(date, "Asia/Ho_Chi_Minh");
      expect(vnMidnight.toISOString()).toBe("2026-10-05T00:00:00.000Z");

      // In Asia/Tokyo (+9): 2026-10-06 01:30 (crosses into next day!) -> 2026-10-06T00:00:00.000Z
      const tokyoMidnight = getMidnightDate(date, "Asia/Tokyo");
      expect(tokyoMidnight.toISOString()).toBe("2026-10-06T00:00:00.000Z");

      // In America/New_York (-4 in Oct EDT): 2026-10-05 12:30 -> 2026-10-05T00:00:00.000Z
      const nyMidnight = getMidnightDate(date, "America/New_York");
      expect(nyMidnight.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    });

    it("isDateInPeriod correctly classifies timestamps near midnight across timezones", () => {
      // Timestamp: 2026-10-01 17:30 UTC
      // In UTC: 2026-10-01
      // In Asia/Ho_Chi_Minh (+7): 2026-10-02 00:30 (Day 2!)
      // In America/New_York (-4): 2026-10-01 13:30 (Day 1)
      const edgeDate = new Date("2026-10-01T17:30:00.000Z");

      // For period 2026-10-02 to 2026-10-02:
      // In VN (+7): 00:30 on 10-02 is INSIDE
      expect(isDateInPeriod(edgeDate, "2026-10-02", "2026-10-02", "Asia/Ho_Chi_Minh")).toBe(true);

      // In UTC: 17:30 on 10-01 is OUTSIDE 10-02
      expect(isDateInPeriod(edgeDate, "2026-10-02", "2026-10-02", "UTC")).toBe(false);

      // In NY: 13:30 on 10-01 is OUTSIDE 10-02
      expect(isDateInPeriod(edgeDate, "2026-10-02", "2026-10-02", "America/New_York")).toBe(false);

      // For period 2026-10-01 to 2026-10-01:
      // In VN: OUTSIDE (it's already 10-02)
      expect(isDateInPeriod(edgeDate, "2026-10-01", "2026-10-01", "Asia/Ho_Chi_Minh")).toBe(false);

      // In UTC: INSIDE (it's 10-01)
      expect(isDateInPeriod(edgeDate, "2026-10-01", "2026-10-01", "UTC")).toBe(true);
    });

    it("calculateFlowMetrics attributes throughput correctly based on timezone boundary", () => {
      // Event completed at 2026-10-01 18:30 UTC:
      // In Asia/Ho_Chi_Minh (+7): 2026-10-02 01:30 (falls inside 2026-10-02 to 2026-10-03)
      // In UTC: 2026-10-01 18:30 (falls outside 2026-10-02 to 2026-10-03)
      const issue = makeIssue({
        jiraKey: "FLOW-TZ",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-01T18:30:00.000Z"),
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
      });

      // Query for period 2026-10-02 to 2026-10-03 in VN
      const flowVn = calculateFlowMetrics({
        issues: [issue],
        from: "2026-10-02",
        to: "2026-10-03",
        timezone: "Asia/Ho_Chi_Minh",
        unit: "tasks",
      });
      expect(flowVn.flow.completedInPeriod).toBe(1);
      expect(flowVn.completedIssueKeys.has("FLOW-TZ")).toBe(true);

      // Same query for period 2026-10-02 to 2026-10-03 in UTC
      const flowUtc = calculateFlowMetrics({
        issues: [issue],
        from: "2026-10-02",
        to: "2026-10-03",
        timezone: "UTC",
        unit: "tasks",
      });
      expect(flowUtc.flow.completedInPeriod).toBe(0);
      expect(flowUtc.completedIssueKeys.has("FLOW-TZ")).toBe(false);
    });

    it("evaluateTaskExplorerItems respects timezone for creation and completion activity", () => {
      // Created at 2026-10-01 22:00 UTC (In VN: 2026-10-02 05:00)
      const rawIssue: RawReportTaskRecord = {
        jiraKey: "TASK-TZ",
        projectKey: "PRJ",
        summary: "Timezone task",
        status: "To Do",
        statusCategory: "new",
        statusChangedAt: null,
        assigneeJira: "alice",
        priority: "High",
        points: 5,
        originalEstimateSeconds: null,
        timeSpent: null,
        dueDate: null,
        createdAt: new Date("2026-10-01T22:00:00.000Z"),
        updatedAt: new Date("2026-10-01T22:00:00.000Z"),
        labels: [],
        raw: null,
        lastSyncedAt: new Date(),
        fixVersionNames: ["v1.0"],
      };

      // Period is 2026-10-02 to 2026-10-02 in Asia/Ho_Chi_Minh -> activity = "created"
      const resultVn = evaluateTaskExplorerItems([rawIssue], {
        period: {
          from: "2026-10-02",
          to: "2026-10-02",
          timezone: "Asia/Ho_Chi_Minh",
          preset: "custom",
        },
      });
      expect(resultVn.items.length).toBe(1);
      expect(resultVn.items[0].activity).toBe("created");

      // Period is 2026-10-02 to 2026-10-02 in UTC -> created on 10-01, so in 10-02 it is "current_open"
      const resultUtc = evaluateTaskExplorerItems([rawIssue], {
        period: {
          from: "2026-10-02",
          to: "2026-10-02",
          timezone: "UTC",
          preset: "custom",
        },
      });
      expect(resultUtc.items.length).toBe(1);
      expect(resultUtc.items[0].activity).toBe("current_open");
    });

    it("calculateHistoryMetrics groups data points correctly into local calendar day buckets", () => {
      // Two tasks created on same UTC day (2026-10-02 at 02:00 UTC and 2026-10-02 at 18:00 UTC)
      // In Asia/Ho_Chi_Minh:
      // - 02:00 UTC is 09:00 on 2026-10-02
      // - 18:00 UTC is 01:00 on 2026-10-03 (Next day!)
      const task1 = makeIssue({
        jiraKey: "HIST-1",
        createdAt: new Date("2026-10-02T02:00:00.000Z"),
      });
      const task2 = makeIssue({
        jiraKey: "HIST-2",
        createdAt: new Date("2026-10-02T18:00:00.000Z"),
      });

      const historyVn = calculateHistoryMetrics({
        issues: [task1, task2],
        period: {
          from: "2026-10-01",
          to: "2026-10-04",
          timezone: "Asia/Ho_Chi_Minh",
          preset: "custom",
        },
      });

      const day2 = historyVn.dataPoints.find((p) => p.date === "2026-10-02");
      const day3 = historyVn.dataPoints.find((p) => p.date === "2026-10-03");

      expect(day2?.createdCount).toBe(1); // Only task1 in VN
      expect(day3?.createdCount).toBe(1); // task2 falls into day 3 in VN

      // In UTC:
      const historyUtc = calculateHistoryMetrics({
        issues: [task1, task2],
        period: {
          from: "2026-10-01",
          to: "2026-10-04",
          timezone: "UTC",
          preset: "custom",
        },
      });

      const day2Utc = historyUtc.dataPoints.find((p) => p.date === "2026-10-02");
      const day3Utc = historyUtc.dataPoints.find((p) => p.date === "2026-10-03");

      expect(day2Utc?.createdCount).toBe(2); // Both tasks created on 2026-10-02 in UTC
      expect(day3Utc?.createdCount).toBe(0);
    });
  });

  describe("Portfolio Rollup Filtering and Sorting", () => {
    it("sorts projects by health severity and filters correctly", () => {
      const summaryAtRisk = calculatePortfolioProjectSummary({
        projectKey: "PRJ-Z",
        projectName: "Z Project",
        period: samplePeriod,
        periodLabel: "01/10 - 07/10",
        mappedIssues: [
          makeIssue({
            status: "Blocked",
            statusCategory: "indeterminate",
            statusChangedAt: new Date("2026-09-01T00:00:00.000Z"),
          }),
        ],
        freshness: mockFreshness,
      });

      const summaryHealthy = calculatePortfolioProjectSummary({
        projectKey: "PRJ-A",
        projectName: "A Project",
        period: samplePeriod,
        periodLabel: "01/10 - 07/10",
        mappedIssues: [
          makeIssue({
            status: "Done",
            statusCategory: "done",
            statusChangedAt: new Date("2026-10-02T00:00:00.000Z"),
          }),
          makeIssue({
            status: "To Do",
            statusCategory: "new",
            dueDate: new Date("2026-10-30T00:00:00.000Z"),
          }),
        ],
        freshness: mockFreshness,
      });

      const rollup = calculatePortfolioRollup([summaryHealthy, summaryAtRisk]);

      // at_risk comes before healthy
      expect(rollup.projects[0].projectKey).toBe("PRJ-Z");
      expect(rollup.projects[1].projectKey).toBe("PRJ-A");
      expect(rollup.summary.total).toBe(2);
      expect(rollup.summary.atRisk).toBe(1);
      expect(rollup.summary.healthy).toBe(1);

      // Filter by healthy only
      const filtered = calculatePortfolioRollup([summaryHealthy, summaryAtRisk], ["healthy"]);
      expect(filtered.projects.length).toBe(1);
      expect(filtered.projects[0].projectKey).toBe("PRJ-A");
      // Summary counts still reflect total
      expect(filtered.summary.total).toBe(2);
    });
  });
});
