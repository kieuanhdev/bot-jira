import { describe, expect, it } from "vitest";
import {
  buildMissingBulkFields,
  getEstimationMissingLabel,
  formatTimeSpent,
  formatDueDate,
} from "./stale-utils";
import type { StandardizationTask } from "./stale-types";

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
