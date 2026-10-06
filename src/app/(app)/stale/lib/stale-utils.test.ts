import { describe, expect, it } from "vitest";
import {
  buildMissingBulkFields,
  computeFocusCounts,
  filterFocusedTasks,
  filterStdTasks,
  getEstimationMissingLabel,
  formatTimeSpent,
  formatDueDate,
  type StdFilters,
} from "./stale-utils";
import type { StandardizationTask, Task } from "./stale-types";

function mockTask(overrides: Partial<StandardizationTask>): StandardizationTask {
  return {
    jiraKey: "CICM-101",
    projectKey: "CICM",
    summary: "Mock task",
    status: "In Progress",
    statusCategory: "indeterminate",
    statusGroup: "In Progress",
    assigneeJira: "user1",
    type: "Task",
    priority: "Medium",
    points: null,
    originalEstimateSeconds: null,
    timeSpent: null,
    fixVersionNames: [],
    dueDate: null,
    labels: [],
    policyId: "default",
    policyVersion: "1.0",
    statusResult: "incomplete",
    required: ["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"],
    missing: ["ESTIMATION", "FIX_VERSION", "DUE_DATE"],
    satisfied: [],
    unknown: [],
    warnings: [],
    isStale: false,
    stateAgeDays: 5,
    slaDays: 7,
    overdueDays: 0,
    isBlocked: false,
    blockedDays: 0,
    updatedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("stale-utils estimation & bulk fields", () => {
  it("only includes 'points' (not 'estimate') for project like CICM that uses Points", () => {
    const cicmTaskIncomplete = mockTask({
      jiraKey: "CICM-1",
      projectKey: "CICM",
      points: null,
      originalEstimateSeconds: null,
      missing: ["ESTIMATION", "FIX_VERSION"],
    });

    const cicmTaskComplete = mockTask({
      jiraKey: "CICM-2",
      projectKey: "CICM",
      points: 3,
      originalEstimateSeconds: null,
      missing: [],
    });

    const allTasks = [cicmTaskIncomplete, cicmTaskComplete];
    const fields = buildMissingBulkFields(new Set(["CICM-1"]), allTasks);

    // Should include points and fixVersions, but MUST NOT include estimate
    const fieldList = fields.split(",");
    expect(fieldList).toContain("points");
    expect(fieldList).toContain("fixVersions");
    expect(fieldList).not.toContain("estimate");
  });

  it("includes 'estimate' when project uses time tracking instead of points", () => {
    const timeTaskIncomplete = mockTask({
      jiraKey: "TIME-1",
      projectKey: "TIME",
      points: null,
      originalEstimateSeconds: null,
      missing: ["ESTIMATION"],
    });

    const timeTaskComplete = mockTask({
      jiraKey: "TIME-2",
      projectKey: "TIME",
      points: null,
      originalEstimateSeconds: 3600,
      missing: [],
    });

    const allTasks = [timeTaskIncomplete, timeTaskComplete];
    const fields = buildMissingBulkFields(new Set(["TIME-1"]), allTasks);

    const fieldList = fields.split(",");
    expect(fieldList).toContain("estimate");
    expect(fieldList).not.toContain("points");
  });

  it("getEstimationMissingLabel returns 'Thiếu Points' for points-based projects like CICM", () => {
    const cicmTask = mockTask({
      jiraKey: "CICM-1",
      projectKey: "CICM",
      points: null,
      originalEstimateSeconds: null,
    });
    const otherCicmTask = mockTask({
      jiraKey: "CICM-2",
      projectKey: "CICM",
      points: 5,
      originalEstimateSeconds: null,
    });

    const label = getEstimationMissingLabel(cicmTask, [cicmTask, otherCicmTask]);
    expect(label).toBe("Thiếu Points");
  });

  it("getEstimationMissingLabel returns 'Thiếu Estimate' for time-estimate-based projects", () => {
    const timeTask = mockTask({
      jiraKey: "TM-1",
      projectKey: "TM",
      points: null,
      originalEstimateSeconds: null,
    });
    const otherTimeTask = mockTask({
      jiraKey: "TM-2",
      projectKey: "TM",
      points: null,
      originalEstimateSeconds: 7200,
    });

    const label = getEstimationMissingLabel(timeTask, [timeTask, otherTimeTask]);
    expect(label).toBe("Thiếu Estimate");
  });

  it("formats timeSpent and dueDate properly", () => {
    expect(formatTimeSpent(null)).toBeNull();
    expect(formatTimeSpent(0)).toBeNull();
    expect(formatTimeSpent(3600)).toBe("1h");
    expect(formatTimeSpent(5400)).toBe("1h 30m");
    expect(formatDueDate(null)).toBeNull();
    expect(formatDueDate("2026-10-15")).toContain("15/10/2026");
  });
});

const mockStaleTask = (overrides: Partial<Task>): Task => ({
  jiraKey: "EPM-1",
  projectKey: "EPM",
  summary: "Fix login",
  status: "In Progress",
  statusGroup: "In Progress",
  assigneeJira: "alice",
  type: "Task",
  priority: "Medium",
  points: null,
  fixVersionNames: [],
  dueDate: null,
  timeSpent: null,
  totalAgeDays: 10,
  stateAgeDays: 5,
  inactiveDays: 0,
  blockedDays: 0,
  staleReason: "slow",
  staleReasonLabel: "Chậm tiến độ",
  severity: "warning",
  slaDays: 3,
  overByDays: 2,
  baselineLevel: "within",
  expectedCycleMax: null,
  alertThreshold: null,
  overdueDays: 0,
  labels: [],
  ...overrides,
});

describe("filterFocusedTasks / computeFocusCounts", () => {
  const tasks = [
    mockStaleTask({ jiraKey: "EPM-1", severity: "high" }),
    mockStaleTask({ jiraKey: "EPM-2", assigneeJira: null, summary: "Đăng nhập lỗi" }),
    mockStaleTask({ jiraKey: "EPM-3", staleReason: "blocked", overdueDays: 2 }),
  ];

  it("filters by focus lens", () => {
    expect(filterFocusedTasks(tasks, "high", "").map((t) => t.jiraKey)).toEqual(["EPM-1"]);
    expect(filterFocusedTasks(tasks, "unassigned", "").map((t) => t.jiraKey)).toEqual(["EPM-2"]);
    expect(filterFocusedTasks(tasks, "all", "")).toHaveLength(3);
  });

  it("matches the query across key, summary, status, assignee and reason (case-insensitive)", () => {
    expect(filterFocusedTasks(tasks, "all", "  epm-3 ").map((t) => t.jiraKey)).toEqual(["EPM-3"]);
    expect(filterFocusedTasks(tasks, "all", "ĐĂNG NHẬP").map((t) => t.jiraKey)).toEqual(["EPM-2"]);
    expect(filterFocusedTasks(tasks, "all", "alice")).toHaveLength(2);
  });

  it("counts each focus lens and tolerates missing data", () => {
    expect(computeFocusCounts(tasks)).toEqual({ high: 1, blocked: 1, overdue: 1, unassigned: 1 });
    expect(computeFocusCounts(undefined)).toEqual({ high: 0, blocked: 0, overdue: 0, unassigned: 0 });
  });
});

describe("filterStdTasks", () => {
  const base: StdFilters = {
    missing: "ALL",
    project: "all",
    status: "all",
    stale: "ALL",
    search: "",
    sort: "missing-desc",
  };
  const tasks = [
    mockTask({ jiraKey: "CICM-1", missing: ["WORKLOG"], stateAgeDays: 2, isStale: false }),
    mockTask({ jiraKey: "CICM-2", missing: ["WORKLOG", "DUE_DATE"], stateAgeDays: 9, isStale: true }),
    mockTask({ jiraKey: "EPM-3", projectKey: "EPM", missing: ["DUE_DATE"], stateAgeDays: 9, isStale: true, status: "Done" }),
  ];

  it("applies missing, project, status and stale filters", () => {
    expect(filterStdTasks(tasks, { ...base, missing: "DUE_DATE" }).map((t) => t.jiraKey)).toEqual(["CICM-2", "EPM-3"]);
    expect(filterStdTasks(tasks, { ...base, project: "EPM" }).map((t) => t.jiraKey)).toEqual(["EPM-3"]);
    expect(filterStdTasks(tasks, { ...base, status: "Done" }).map((t) => t.jiraKey)).toEqual(["EPM-3"]);
    expect(filterStdTasks(tasks, { ...base, stale: "healthy" }).map((t) => t.jiraKey)).toEqual(["CICM-1"]);
    expect(filterStdTasks(tasks, { ...base, stale: "stale" })).toHaveLength(2);
  });

  it("searches by key (case-insensitive)", () => {
    expect(filterStdTasks(tasks, { ...base, search: " epm-3" }).map((t) => t.jiraKey)).toEqual(["EPM-3"]);
  });

  it("sorts by missing count, then state age, then key", () => {
    expect(filterStdTasks(tasks, base).map((t) => t.jiraKey)).toEqual(["CICM-2", "EPM-3", "CICM-1"]);
    expect(filterStdTasks(tasks, { ...base, sort: "stateAge-desc" }).map((t) => t.jiraKey)).toEqual(["CICM-2", "EPM-3", "CICM-1"]);
    expect(filterStdTasks(tasks, { ...base, sort: "key-asc" }).map((t) => t.jiraKey)).toEqual(["CICM-1", "CICM-2", "EPM-3"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...tasks];
    filterStdTasks(tasks, base);
    expect(tasks).toEqual(copy);
  });
});
