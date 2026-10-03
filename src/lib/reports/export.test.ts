import { describe, it, expect } from "vitest";
import { generateProjectReportCsv } from "./export";
import type { ProjectDetailResponse, RiskTaskItem } from "./types";

describe("generateProjectReportCsv (Section 9.4, RPT-301)", () => {
  const mockReport: ProjectDetailResponse = {
    projectKey: "EPM",
    projectName: "Enterprise Project Management",
    project: {
      key: "EPM",
      name: "Enterprise Project Management",
    },
    generatedAt: "2026-10-03T10:00:00.000Z",
    timezone: "Asia/Ho_Chi_Minh",
    period: {
      preset: "this_week",
      from: "2026-09-28",
      to: "2026-10-04",
      timezone: "Asia/Ho_Chi_Minh",
    },
    periodLabel: "Tuần này (28/09 - 04/10)",
    comparisonPeriod: null,
    freshness: {
      status: "healthy",
      isFresh: true,
      workerAgeMs: 5000,
      jiraSyncAgeMs: 12000,
      lastSyncedAt: "2026-10-03T09:55:00.000Z",
    },
    scope: {
      versionId: "10023",
      versionName: "Release 2.4.0",
      releaseDate: "2026-10-25",
      startDate: "2026-09-01",
      unit: "points",
      requestedUnit: "auto",
      includeSubtasks: true,
      totalScopeIssues: 45,
      totalIssues: 45,
    },
    availableVersions: [],
    snapshotAtEnd: {
      openAtEnd: 18,
      doneAtEnd: 27,
      totalAtEnd: 45,
      wipAtEnd: 12,
      blockedAtEnd: 2,
      overdueAtEnd: 1,
      overSlaAtEnd: 3,
      unassignedAtEnd: 4,
      completionRatio: 65,
      doneUnits: 65,
      totalUnits: 100,
      unit: "points",
      coverage: { pointsCoverage: 90, estimateCoverage: 40, recommendedUnit: "points" },
    },
    flow: {
      createdInPeriod: 10,
      completedInPeriod: 15,
      reopenedInPeriod: 0,
      statusTransitionsInPeriod: 25,
      throughput: 15,
      throughputPoints: 35,
      throughputEstimateHours: 40,
      netBacklogChange: -5,
    },
    comparison: null,
    kpis: {
      progress: { percentage: 65, done: 65, total: 100, unit: "points" },
      taskProgress: { percentage: 60, done: 27, total: 45, unit: "tasks" },
      pointProgress: { percentage: 65, done: 65, total: 100, unit: "points" },
      estimateProgress: { percentage: 50, done: 100, total: 200, unit: "estimate" },
      coverage: { pointsCoverage: 90, estimateCoverage: 40, recommendedUnit: "points" },
      wipCount: 12,
      blockedCount: 2,
      overdueCount: 1,
      overSlaCount: 3,
      unassignedCount: 4,
      scheduleGapPercentage: 5,
      timeElapsedPercentage: 70,
    },
    health: {
      status: "attention",
      headline: "Dự án cần chú ý: Có 2 task đang bị nghẽn",
      reasons: [{ code: "HAS_BLOCKED_TASKS", message: "Có 2 task đang bị nghẽn", severity: "warning" }],
    },
    dataQuality: [],
    statusDistribution: [
      { group: "Done", count: 27, points: 65, estimateSeconds: 360000, percentage: 60 },
      { group: "In Progress", count: 12, points: 25, estimateSeconds: 180000, percentage: 27 },
      { group: "Blocked", count: 2, points: 5, estimateSeconds: 36000, percentage: 4 },
      { group: "To Do", count: 4, points: 5, estimateSeconds: 36000, percentage: 9 },
    ],
    workload: [],
    bottlenecks: [],
    topRisks: [],
  };

  const mockRisks: RiskTaskItem[] = [
    {
      jiraKey: "EPM-101",
      projectKey: "EPM",
      summary: "Tích hợp cổng thanh toán, có dấu phẩy và \"ngoặc kép\"",
      status: "Blocked",
      statusGroup: "Blocked",
      assigneeJira: "dev1",
      assigneeDisplayName: "Nguyễn Văn A",
      priority: "High",
      points: 5,
      originalEstimateSeconds: 14400,
      dueDate: "2026-10-10",
      risks: ["blocked", "over_sla"],
      stateAgeDays: 4,
      blockedDays: 4,
      overdueDays: 0,
      slaDays: 2,
      severity: "high",
    },
  ];

  it("includes UTF-8 BOM at the beginning of the CSV file", () => {
    const csv = generateProjectReportCsv(mockReport, mockRisks);
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("escapes fields containing commas and quotes properly (RFC 4180)", () => {
    const csv = generateProjectReportCsv(mockReport, mockRisks);
    expect(csv).toContain('"Tích hợp cổng thanh toán, có dấu phẩy và ""ngoặc kép"""');
  });

  it("contains scope metadata, KPIs, distribution and risk task rows", () => {
    const csv = generateProjectReportCsv(mockReport, mockRisks);
    expect(csv).toContain("Enterprise Project Management (EPM)");
    expect(csv).toContain("Release 2.4.0");
    expect(csv).toContain("Tiến độ (%)");
    expect(csv).toContain("65%");
    expect(csv).toContain("EPM-101");
    expect(csv).toContain("Nguyễn Văn A");
  });
});
