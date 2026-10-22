import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  issueCacheFindMany: vi.fn(),
  issueCacheCount: vi.fn(),
  watchFindMany: vi.fn(),
  releaseFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    issueCache: {
      findMany: mocks.issueCacheFindMany,
      count: mocks.issueCacheCount,
    },
    watch: {
      findMany: mocks.watchFindMany,
    },
    release: {
      findFirst: mocks.releaseFindFirst,
    },
  },
}));

import {
  isDoneCategory,
  resolveJiraUsername,
  getMyWorkSummary,
  getMyWorkTasks,
  getMyWorkAnalytics,
  getMyWorkTimeline,
} from "./service";

describe("my-work service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isDoneCategory", () => {
    it("returns true for done status category", () => {
      expect(isDoneCategory("done", "In Progress")).toBe(true);
      expect(isDoneCategory("Done", "Whatever")).toBe(true);
    });

    it("returns true for done statuses", () => {
      expect(isDoneCategory("indeterminate", "Done")).toBe(true);
      expect(isDoneCategory("new", "Closed")).toBe(true);
      expect(isDoneCategory(null, "Resolved")).toBe(true);
    });

    it("returns false for active statuses", () => {
      expect(isDoneCategory("indeterminate", "In Progress")).toBe(false);
      expect(isDoneCategory("new", "To Do")).toBe(false);
      expect(isDoneCategory(null, null)).toBe(false);
    });
  });

  describe("resolveJiraUsername", () => {
    it("uses jiraUsername if already in user object", async () => {
      const res = await resolveJiraUsername({ id: "u1", jiraUsername: "developer_a" });
      expect(res).toBe("developer_a");
      expect(mocks.userFindUnique).not.toHaveBeenCalled();
    });

    it("falls back to DB lookup when jiraUsername not in profile", async () => {
      mocks.userFindUnique.mockResolvedValueOnce({
        jiraUsername: "db_user",
        email: "test@example.com",
        displayName: "Test User",
      });
      const res = await resolveJiraUsername({ id: "u1" });
      expect(res).toBe("db_user");
      expect(mocks.userFindUnique).toHaveBeenCalledWith({
        where: { id: "u1" },
        select: { jiraUsername: true, email: true, displayName: true },
      });
    });

    it("falls back to email prefix if db has no jiraUsername", async () => {
      mocks.userFindUnique.mockResolvedValueOnce({
        jiraUsername: null,
        email: "alice.dev@company.com",
        displayName: "Alice",
      });
      const res = await resolveJiraUsername({ id: "u1" });
      expect(res).toBe("alice.dev");
    });
  });

  describe("getMyWorkSummary", () => {
    it("computes correct summary metrics", async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago overdue
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0);

      // Assigned issues
      mocks.issueCacheFindMany
        .mockResolvedValueOnce([
          {
            jiraKey: "DEV-1",
            status: "In Progress",
            statusCategory: "indeterminate",
            dueDate: pastDate,
            completedAt: null,
          },
          {
            jiraKey: "DEV-2",
            status: "To Do",
            statusCategory: "new",
            dueDate: todayDate,
            completedAt: null,
          },
          {
            jiraKey: "DEV-3",
            status: "Done",
            statusCategory: "done",
            dueDate: null,
            completedAt: new Date(),
          },
        ])
        // Waiting action issues
        .mockResolvedValueOnce([
          { status: "In Review", statusCategory: "indeterminate" },
        ])
        // Completed with due date (for on-time rate)
        .mockResolvedValueOnce([
          {
            completedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            dueDate: new Date(now.getTime()),
          },
        ]);

      mocks.releaseFindFirst.mockResolvedValueOnce(null);

      const summary = await getMyWorkSummary({ id: "u1", jiraUsername: "developer_a" });

      expect(summary.assignedCount).toBe(2);
      expect(summary.inProgressCount).toBe(1);
      expect(summary.overdueCount).toBe(1);
      expect(summary.dueTodayCount).toBe(1);
      expect(summary.waitingActionCount).toBe(1);
      expect(summary.recentDoneCount).toBe(1);
      expect(summary.onTimeRate).toBe(100);
    });
  });

  describe("getMyWorkTasks", () => {
    it("fetches tasks with correct role and pagination", async () => {
      mocks.issueCacheCount.mockResolvedValueOnce(1);
      mocks.issueCacheFindMany.mockResolvedValueOnce([
        {
          jiraKey: "PROJ-10",
          projectKey: "PROJ",
          summary: "Implement feature",
          status: "In Progress",
          statusCategory: "indeterminate",
          priority: "High",
          type: "Story",
          points: 5,
          dueDate: null,
          timeSpent: 120,
          originalEstimateSeconds: 3600,
          assigneeJira: "developer_a",
          reporterJira: "pm_user",
          approverJira: null,
          testerJira: null,
          completedAt: null,
          updatedAt: new Date(),
        },
      ]);
      mocks.watchFindMany.mockResolvedValueOnce([{ jiraKey: "PROJ-10" }]);

      const res = await getMyWorkTasks(
        { id: "u1", jiraUsername: "developer_a" },
        { role: "assigned", page: 1, limit: 10 }
      );

      expect(res.items.length).toBe(1);
      expect(res.items[0].jiraKey).toBe("PROJ-10");
      expect(res.items[0].isWatching).toBe(true);
      expect(res.pagination.total).toBe(1);
    });
  });

  describe("getMyWorkAnalytics", () => {
    it("aggregates velocity and type distribution", async () => {
      const now = new Date();
      mocks.issueCacheFindMany
        // Completed issues
        .mockResolvedValueOnce([
          {
            jiraKey: "PROJ-1",
            points: 3,
            type: "Bug",
            createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
            statusChangedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
            completedAt: now,
          },
        ])
        // Recent issues for types
        .mockResolvedValueOnce([{ type: "Bug" }, { type: "Story" }])
        // Active tasks for status
        .mockResolvedValueOnce([
          { status: "In Progress", statusCategory: "indeterminate" },
          { status: "To Do", statusCategory: "new" },
        ]);

      const analytics = await getMyWorkAnalytics({ id: "u1", jiraUsername: "developer_a" }, 4);

      expect(analytics.velocityByWeek.length).toBe(4);
      expect(analytics.typeDistribution.length).toBe(2);
      expect(analytics.statusDistribution.length).toBe(2);
      expect(analytics.cycleTimeStats.sampleCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getMyWorkTimeline", () => {
    it("groups issues into timeline buckets", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      mocks.issueCacheFindMany.mockResolvedValueOnce([
        {
          jiraKey: "OVERDUE-1",
          projectKey: "PROJ",
          summary: "Overdue task",
          status: "In Progress",
          statusCategory: "indeterminate",
          priority: "High",
          type: "Bug",
          points: 2,
          dueDate: yesterday,
          timeSpent: null,
          originalEstimateSeconds: null,
          assigneeJira: "developer_a",
          reporterJira: null,
          approverJira: null,
          testerJira: null,
          completedAt: null,
          updatedAt: new Date(),
        },
        {
          jiraKey: "FUTURE-1",
          projectKey: "PROJ",
          summary: "Future task",
          status: "To Do",
          statusCategory: "new",
          priority: "Medium",
          type: "Story",
          points: 5,
          dueDate: nextWeek,
          timeSpent: null,
          originalEstimateSeconds: null,
          assigneeJira: "developer_a",
          reporterJira: null,
          approverJira: null,
          testerJira: null,
          completedAt: null,
          updatedAt: new Date(),
        },
      ]);

      const groups = await getMyWorkTimeline({ id: "u1", jiraUsername: "developer_a" }, 14);

      const overdueGroup = groups.find((g) => g.groupKey === "overdue");
      expect(overdueGroup).toBeDefined();
      expect(overdueGroup?.tasks[0].jiraKey).toBe("OVERDUE-1");
    });
  });
});
