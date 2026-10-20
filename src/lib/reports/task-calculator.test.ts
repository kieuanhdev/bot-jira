import { describe, expect, it } from "vitest";
import { evaluateTaskExplorerItems } from "./task-calculator";
import type { RawReportTaskRecord } from "./query-primitives";
import type { ReportPeriod } from "./types";

function makeTask(overrides: Partial<RawReportTaskRecord> = {}): RawReportTaskRecord {
  return {
    jiraKey: "PROJ-1",
    projectKey: "PROJ",
    summary: "Task summary",
    status: "In Progress",
    statusCategory: "indeterminate",
    statusChangedAt: new Date("2026-10-10T00:00:00.000Z"),
    assigneeJira: "alice",
    priority: "High",
    points: 3,
    originalEstimateSeconds: 3600,
    timeSpent: 1800,
    dueDate: new Date("2026-10-25T00:00:00.000Z"),
    createdAt: new Date("2026-10-05T00:00:00.000Z"),
    updatedAt: new Date("2026-10-10T00:00:00.000Z"),
    labels: ["frontend"],
    completedAt: null,
    lastSyncedAt: new Date("2026-10-10T00:00:00.000Z"),
    fixVersionNames: ["v1.0"],
    ...overrides,
  };
}

const defaultPeriod: ReportPeriod = {
  preset: "custom",
  from: "2026-10-01",
  to: "2026-10-31",
  timezone: "UTC",
};

describe("evaluateTaskExplorerItems", () => {
  it("returns empty result when given no issues", () => {
    const res = evaluateTaskExplorerItems([], { period: defaultPeriod });
    expect(res).toEqual({ items: [], total: 0 });
  });

  describe("activity classification", () => {
    it("marks completed when task status is Done and resolution date is in period", () => {
      const task = makeTask({
        jiraKey: "PROJ-10",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-15T12:00:00.000Z"),
      });

      const res = evaluateTaskExplorerItems([task], { period: defaultPeriod });
      expect(res.total).toBe(1);
      expect(res.items[0].activity).toBe("completed");
      expect(res.items[0].completedAt).toBe("2026-10-15T12:00:00.000Z");
    });

    it("marks created when task was created in period and not completed", () => {
      const task = makeTask({
        jiraKey: "PROJ-11",
        createdAt: new Date("2026-10-08T00:00:00.000Z"),
        status: "To Do",
        statusCategory: "new",
      });

      const res = evaluateTaskExplorerItems([task], { period: defaultPeriod });
      expect(res.total).toBe(1);
      expect(res.items[0].activity).toBe("created");
    });

    it("marks current_open when created before period and still in progress", () => {
      const task = makeTask({
        jiraKey: "PROJ-12",
        createdAt: new Date("2026-09-15T00:00:00.000Z"),
        status: "In Progress",
        statusCategory: "indeterminate",
      });

      const res = evaluateTaskExplorerItems([task], { period: defaultPeriod });
      expect(res.total).toBe(1);
      expect(res.items[0].activity).toBe("current_open");
    });
  });

  describe("risk detection", () => {
    const fixedNow = new Date("2026-10-20T12:00:00.000Z");

    it("flags blocked risk when status is Blocked", () => {
      const task = makeTask({
        status: "Blocked",
        statusCategory: "indeterminate",
      });

      const res = evaluateTaskExplorerItems([task], {
        period: defaultPeriod,
        now: fixedNow,
      });
      expect(res.items[0].risks).toContain("blocked");
    });

    it("flags overdue risk when due date is in the past", () => {
      const task = makeTask({
        dueDate: new Date("2026-10-10T00:00:00.000Z"),
      });

      const res = evaluateTaskExplorerItems([task], {
        period: defaultPeriod,
        now: fixedNow,
      });
      expect(res.items[0].risks).toContain("overdue");
    });

    it("flags unassigned risk when assignee is missing or empty", () => {
      const task = makeTask({
        assigneeJira: null,
      });

      const res = evaluateTaskExplorerItems([task], {
        period: defaultPeriod,
        now: fixedNow,
      });
      expect(res.items[0].risks).toContain("unassigned");
    });

    it("flags over_sla when age in state exceeds SLA", () => {
      const task = makeTask({
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: new Date("2026-09-01T00:00:00.000Z"),
      });

      const res = evaluateTaskExplorerItems([task], {
        period: defaultPeriod,
        now: fixedNow,
      });
      expect(res.items[0].risks).toContain("over_sla");
    });
  });

  describe("filtering", () => {
    const tasks = [
      makeTask({
        jiraKey: "PROJ-1",
        summary: "Login bug",
        status: "In Progress",
        statusCategory: "indeterminate",
        assigneeJira: "alice",
      }),
      makeTask({
        jiraKey: "PROJ-2",
        summary: "Signup feature",
        status: "Blocked",
        statusCategory: "indeterminate",
        assigneeJira: "bob",
      }),
      makeTask({
        jiraKey: "PROJ-3",
        summary: "Database migration",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-12T00:00:00.000Z"),
        assigneeJira: null,
      }),
    ];

    it("filters by statusGroup", () => {
      const res = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        statusGroup: "Blocked",
      });
      expect(res.total).toBe(1);
      expect(res.items[0].jiraKey).toBe("PROJ-2");
    });

    it("filters by assignee", () => {
      const res = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        assignee: "alice",
      });
      expect(res.total).toBe(1);
      expect(res.items[0].jiraKey).toBe("PROJ-1");
    });

    it("filters by unassigned", () => {
      const res = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        assignee: "unassigned",
      });
      expect(res.total).toBe(1);
      expect(res.items[0].jiraKey).toBe("PROJ-3");
    });

    it("filters by search query matching key or summary", () => {
      const resKey = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        search: "proj-2",
      });
      expect(resKey.total).toBe(1);
      expect(resKey.items[0].jiraKey).toBe("PROJ-2");

      const resSummary = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        search: "migration",
      });
      expect(resSummary.total).toBe(1);
      expect(resSummary.items[0].jiraKey).toBe("PROJ-3");
    });

    it("filters by risk", () => {
      const res = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        risk: "blocked",
      });
      expect(res.total).toBe(1);
      expect(res.items[0].jiraKey).toBe("PROJ-2");
    });

    it("filters by activity", () => {
      const res = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        activity: "completed",
      });
      expect(res.total).toBe(1);
      expect(res.items[0].jiraKey).toBe("PROJ-3");
    });
  });

  describe("pagination and user display mapping", () => {
    it("slices items by offset and limit while preserving total count", () => {
      const tasks = [
        makeTask({ jiraKey: "P-1" }),
        makeTask({ jiraKey: "P-2" }),
        makeTask({ jiraKey: "P-3" }),
      ];

      const res = evaluateTaskExplorerItems(tasks, {
        period: defaultPeriod,
        offset: 1,
        limit: 1,
      });

      expect(res.total).toBe(3);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].jiraKey).toBe("P-2");
    });

    it("uses userMap to populate assigneeDisplayName", () => {
      const userMap = new Map([["alice", "Alice Wonderland"]]);
      const task = makeTask({ assigneeJira: "alice" });

      const res = evaluateTaskExplorerItems([task], {
        period: defaultPeriod,
        userMap,
      });

      expect(res.items[0].assigneeDisplayName).toBe("Alice Wonderland");
    });
  });

  describe("date boundaries and ignoreDateRange", () => {
    it("excludes tasks created after period.to", () => {
      const futureTask = makeTask({
        createdAt: new Date("2026-11-05T00:00:00.000Z"),
      });

      const res = evaluateTaskExplorerItems([futureTask], { period: defaultPeriod });
      expect(res.total).toBe(0);
    });

    it("excludes tasks already completed before period.from", () => {
      const oldCompletedTask = makeTask({
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-09-10T00:00:00.000Z"),
        updatedAt: new Date("2026-09-10T00:00:00.000Z"),
      });

      const res = evaluateTaskExplorerItems([oldCompletedTask], { period: defaultPeriod });
      expect(res.total).toBe(0);
    });

    it("includes tasks outside date range when ignoreDateRange is true", () => {
      const futureTask = makeTask({
        createdAt: new Date("2026-11-05T00:00:00.000Z"),
      });

      const res = evaluateTaskExplorerItems([futureTask], {
        period: defaultPeriod,
        ignoreDateRange: true,
      });
      expect(res.total).toBe(1);
    });
  });
});
