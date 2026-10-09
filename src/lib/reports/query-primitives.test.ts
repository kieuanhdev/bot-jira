import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mapIssueRecordToReportInput,
  buildProjectIssueWhere,
  getPeriodDateBounds,
  isIssueRelevantToPeriod,
  filterIssuesForPeriod,
  resolveScopedProjectKeys,
  parsePeriodQueryParams,
  parsePaginationParams,
  fetchAssigneeDisplayNameMap,
  fetchProjectReportIssues,
  fetchPortfolioProjectIssues,
  fetchTaskExplorerIssues,
  fetchIssueTransitionEvents,
  fetchAvailableProjectVersions,
  fetchReferenceRelease,
  type RawReportIssueRecord,
} from "./query-primitives";
import type { ReportIssueInput } from "./metrics";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  issueCacheFindMany: vi.fn(),
  issueTransitionEventFindMany: vi.fn(),
  releaseFindMany: vi.fn(),
  releaseFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    issueCache: { findMany: mocks.issueCacheFindMany },
    issueTransitionEvent: { findMany: mocks.issueTransitionEventFindMany },
    release: {
      findMany: mocks.releaseFindMany,
      findFirst: mocks.releaseFindFirst,
    },
  },
}));

describe("Reports Query Primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mapIssueRecordToReportInput", () => {
    it("maps raw Prisma record to domain ReportIssueInput faithfully", () => {
      const record: RawReportIssueRecord = {
        jiraKey: "PROJ-123",
        projectKey: "PROJ",
        summary: "Test issue",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: new Date("2026-10-01T10:00:00Z"),
        assigneeJira: "user1",
        priority: "High",
        points: 5,
        originalEstimateSeconds: 3600,
        timeSpent: 1800,
        dueDate: new Date("2026-10-15T00:00:00Z"),
        createdAt: new Date("2026-09-01T00:00:00Z"),
        updatedAt: new Date("2026-10-02T00:00:00Z"),
        labels: ["backend", "urgent"],
        raw: { id: "1001" },
        lastSyncedAt: new Date("2026-10-03T00:00:00Z"),
      };

      const mapped = mapIssueRecordToReportInput(record);
      expect(mapped).toEqual({
        jiraKey: "PROJ-123",
        projectKey: "PROJ",
        summary: "Test issue",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: record.statusChangedAt,
        assigneeJira: "user1",
        priority: "High",
        points: 5,
        originalEstimateSeconds: 3600,
        timeSpent: 1800,
        dueDate: record.dueDate,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        labels: ["backend", "urgent"],
        raw: { id: "1001" },
      });
    });
  });

  describe("buildProjectIssueWhere", () => {
    it("builds normalized project where clause with deletedAt: null", () => {
      const where = buildProjectIssueWhere("  proj ");
      expect(where).toEqual({
        projectKey: "PROJ",
        deletedAt: null,
      });
    });

    it("merges version where input if supplied", () => {
      const where = buildProjectIssueWhere("proj", {
        fixVersionNames: { has: "v1.0" },
      });
      expect(where).toEqual({
        projectKey: "PROJ",
        deletedAt: null,
        fixVersionNames: { has: "v1.0" },
      });
    });
  });

  describe("getPeriodDateBounds", () => {
    it("returns correct UTC start and end bounds", () => {
      const bounds = getPeriodDateBounds({ from: "2026-10-01", to: "2026-10-07" });
      expect(bounds.startDate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(bounds.endDate.toISOString()).toBe("2026-10-07T23:59:59.999Z");
    });
  });

  describe("isIssueRelevantToPeriod and filterIssuesForPeriod", () => {
    const start = new Date("2026-10-01T00:00:00.000Z");
    const end = new Date("2026-10-07T23:59:59.999Z");

    const baseIssue: ReportIssueInput = {
      jiraKey: "P-1",
      projectKey: "P",
      summary: "Sample",
      status: "In Progress",
      statusCategory: "indeterminate",
      statusChangedAt: null,
      assigneeJira: "dev",
      priority: "Medium",
      points: 1,
      originalEstimateSeconds: 0,
      timeSpent: null,
      dueDate: null,
      createdAt: new Date("2026-09-20T00:00:00Z"),
      updatedAt: new Date("2026-10-02T00:00:00Z"),
      labels: [],
    };

    it("excludes issues created after period end", () => {
      const issue = { ...baseIssue, createdAt: new Date("2026-10-08T00:00:00Z") };
      expect(isIssueRelevantToPeriod(issue, start, end)).toBe(false);
    });

    it("includes open / non-done issues created before period end", () => {
      expect(isIssueRelevantToPeriod(baseIssue, start, end)).toBe(true);
    });

    it("includes done issues completed within period via completedIssueKeys", () => {
      const doneIssue: ReportIssueInput = {
        ...baseIssue,
        status: "Done",
        statusCategory: "done",
      };
      const completedKeys = new Set(["P-1"]);
      expect(isIssueRelevantToPeriod(doneIssue, start, end, completedKeys)).toBe(true);
    });

    it("includes done issues completed within period via resolution date", () => {
      const doneIssue: ReportIssueInput = {
        ...baseIssue,
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-04T12:00:00Z"),
      };
      expect(isIssueRelevantToPeriod(doneIssue, start, end)).toBe(true);
    });

    it("excludes done issues completed before period start", () => {
      const doneIssue: ReportIssueInput = {
        ...baseIssue,
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-09-25T12:00:00Z"),
      };
      expect(isIssueRelevantToPeriod(doneIssue, start, end)).toBe(false);
    });

    it("includes done issues completed after period end (active during period)", () => {
      const doneIssue: ReportIssueInput = {
        ...baseIssue,
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-15T12:00:00Z"),
      };
      expect(isIssueRelevantToPeriod(doneIssue, start, end)).toBe(true);
    });

    it("filters a list of issues correctly", () => {
      const issues: ReportIssueInput[] = [
        { ...baseIssue, jiraKey: "P-1" }, // active -> true
        { ...baseIssue, jiraKey: "P-2", createdAt: new Date("2026-10-09T00:00:00Z") }, // created after -> false
        {
          ...baseIssue,
          jiraKey: "P-3",
          status: "Done",
          statusCategory: "done",
          statusChangedAt: new Date("2026-09-15T00:00:00Z"),
        }, // done before -> false
      ];

      const filtered = filterIssuesForPeriod(issues, start, end);
      expect(filtered.map((i) => i.jiraKey)).toEqual(["P-1"]);
    });
  });

  describe("resolveScopedProjectKeys", () => {
    const allowed = ["ALPHA", "BETA", "GAMMA"];

    it("returns all allowed projects when no filter is provided", () => {
      expect(resolveScopedProjectKeys(allowed)).toEqual(["ALPHA", "BETA", "GAMMA"]);
      expect(resolveScopedProjectKeys(allowed, [])).toEqual(["ALPHA", "BETA", "GAMMA"]);
    });

    it("returns intersection when filterProjects is provided with normalization", () => {
      expect(resolveScopedProjectKeys(allowed, ["alpha", "delta"])).toEqual(["ALPHA"]);
      expect(resolveScopedProjectKeys(allowed, ["BETA", "GAMMA"])).toEqual(["BETA", "GAMMA"]);
    });
  });

  describe("parsePeriodQueryParams", () => {
    it("extracts period parameters from URLSearchParams", () => {
      const params = new URLSearchParams("period=custom&from=2026-10-01&to=2026-10-07&timezone=Asia/Tokyo");
      expect(parsePeriodQueryParams(params)).toEqual({
        period: "custom",
        from: "2026-10-01",
        to: "2026-10-07",
        timezone: "Asia/Tokyo",
      });
    });

    it("returns null for missing parameters", () => {
      const params = new URLSearchParams("");
      expect(parsePeriodQueryParams(params)).toEqual({
        period: null,
        from: null,
        to: null,
        timezone: null,
      });
    });
  });

  describe("parsePaginationParams", () => {
    it("returns default values when params are absent", () => {
      const params = new URLSearchParams("");
      expect(parsePaginationParams(params)).toEqual({ limit: 50, offset: 0 });
    });

    it("parses valid limit and offset", () => {
      const params = new URLSearchParams("limit=25&offset=50");
      expect(parsePaginationParams(params)).toEqual({ limit: 25, offset: 50 });
    });

    it("clamps limit between 1 and maxLimit", () => {
      expect(parsePaginationParams(new URLSearchParams("limit=0"))).toEqual({ limit: 1, offset: 0 });
      expect(parsePaginationParams(new URLSearchParams("limit=500"))).toEqual({ limit: 100, offset: 0 });
      expect(parsePaginationParams(new URLSearchParams("offset=-10"))).toEqual({ limit: 50, offset: 0 });
    });
  });

  describe("fetchAssigneeDisplayNameMap", () => {
    it("returns empty map when input is empty or null", async () => {
      const map = await fetchAssigneeDisplayNameMap([null, undefined, ""]);
      expect(map.size).toBe(0);
      expect(mocks.userFindMany).not.toHaveBeenCalled();
    });

    it("deduplicates usernames and fetches user display names", async () => {
      mocks.userFindMany.mockResolvedValue([
        { jiraUsername: "alice", displayName: "Alice Wonder" },
        { jiraUsername: "bob", displayName: "Bob Builder" },
      ]);

      const map = await fetchAssigneeDisplayNameMap(["alice", "bob", "alice", " "]);
      expect(mocks.userFindMany).toHaveBeenCalledWith({
        where: { jiraUsername: { in: ["alice", "bob"] } },
        select: { jiraUsername: true, displayName: true },
      });
      expect(map.get("alice")).toBe("Alice Wonder");
      expect(map.get("bob")).toBe("Bob Builder");
    });
  });

  describe("fetchProjectReportIssues", () => {
    it("queries Prisma with standard select and maps result", async () => {
      const dbRow: RawReportIssueRecord = {
        jiraKey: "TEST-1",
        projectKey: "TEST",
        summary: "Summary 1",
        status: "Open",
        statusCategory: "new",
        statusChangedAt: null,
        assigneeJira: "tester",
        priority: "Low",
        points: 2,
        originalEstimateSeconds: 1200,
        timeSpent: null,
        dueDate: null,
        createdAt: new Date("2026-10-01T00:00:00Z"),
        updatedAt: null,
        labels: [],
        raw: {},
        lastSyncedAt: new Date("2026-10-02T00:00:00Z"),
      };
      mocks.issueCacheFindMany.mockResolvedValue([dbRow]);

      const result = await fetchProjectReportIssues("test");
      expect(mocks.issueCacheFindMany).toHaveBeenCalledWith({
        where: { projectKey: "TEST", deletedAt: null },
        select: expect.any(Object),
      });
      expect(result.rawIssues).toHaveLength(1);
      expect(result.mappedIssues).toHaveLength(1);
      expect(result.mappedIssues[0].jiraKey).toBe("TEST-1");
    });
  });

  describe("fetchPortfolioProjectIssues", () => {
    it("computes max lastSyncedAt correctly across issues", async () => {
      const d1 = new Date("2026-10-01T00:00:00Z");
      const d2 = new Date("2026-10-05T00:00:00Z");
      mocks.issueCacheFindMany.mockResolvedValue([
        {
          jiraKey: "TEST-1",
          projectKey: "TEST",
          summary: "S1",
          status: "Open",
          statusCategory: null,
          statusChangedAt: null,
          assigneeJira: null,
          priority: null,
          points: null,
          originalEstimateSeconds: null,
          timeSpent: null,
          dueDate: null,
          createdAt: null,
          updatedAt: null,
          labels: [],
          raw: null,
          lastSyncedAt: d1,
        },
        {
          jiraKey: "TEST-2",
          projectKey: "TEST",
          summary: "S2",
          status: "Open",
          statusCategory: null,
          statusChangedAt: null,
          assigneeJira: null,
          priority: null,
          points: null,
          originalEstimateSeconds: null,
          timeSpent: null,
          dueDate: null,
          createdAt: null,
          updatedAt: null,
          labels: [],
          raw: null,
          lastSyncedAt: d2,
        },
      ]);

      const result = await fetchPortfolioProjectIssues("TEST");
      expect(result.lastSyncedAt).toEqual(d2);
    });
  });

  describe("fetchTaskExplorerIssues", () => {
    it("queries issueCache with explorer select and ordering", async () => {
      const mockItem = {
        jiraKey: "TEST-1",
        projectKey: "TEST",
        summary: "Task 1",
        status: "Open",
        statusCategory: "new",
        statusChangedAt: null,
        assigneeJira: "alice",
        priority: "High",
        points: 5,
        originalEstimateSeconds: 3600,
        timeSpent: 0,
        dueDate: null,
        createdAt: new Date("2026-10-01T00:00:00Z"),
        updatedAt: null,
        labels: [],
        raw: null,
        lastSyncedAt: new Date(),
        fixVersionNames: ["v1.0"],
      };
      mocks.issueCacheFindMany.mockResolvedValue([mockItem]);

      const result = await fetchTaskExplorerIssues({ projectKey: "TEST" });
      expect(mocks.issueCacheFindMany).toHaveBeenCalledWith({
        where: { projectKey: "TEST" },
        select: expect.objectContaining({ fixVersionNames: true }),
        orderBy: [{ priority: "asc" }, { jiraKey: "desc" }],
      });
      expect(result).toHaveLength(1);
      expect(result[0].jiraKey).toBe("TEST-1");
    });
  });

  describe("fetchIssueTransitionEvents", () => {
    it("queries transition events within bounds", async () => {
      const startDate = new Date("2026-10-01T00:00:00Z");
      const endDate = new Date("2026-10-07T23:59:59Z");
      mocks.issueTransitionEventFindMany.mockResolvedValue([
        {
          jiraKey: "TEST-1",
          occurredAt: new Date("2026-10-03T10:00:00Z"),
          fromStatusGroup: "To Do",
          toStatusGroup: "In Progress",
        },
      ]);

      const events = await fetchIssueTransitionEvents("test", { startDate, endDate });
      expect(mocks.issueTransitionEventFindMany).toHaveBeenCalledWith({
        where: {
          projectKey: "TEST",
          occurredAt: { gte: startDate, lte: endDate },
        },
        select: {
          jiraKey: true,
          occurredAt: true,
          fromStatusGroup: true,
          toStatusGroup: true,
        },
      });
      expect(events).toHaveLength(1);
      expect(events[0].jiraKey).toBe("TEST-1");
    });
  });

  describe("fetchAvailableProjectVersions", () => {
    it("queries releases and formats output", async () => {
      mocks.releaseFindMany.mockResolvedValue([
        {
          id: "rel-1",
          jiraVersionId: "v101",
          version: "1.0.0",
          releaseDate: new Date("2026-10-20T00:00:00Z"),
          status: "released",
          createdAt: new Date("2026-09-01T00:00:00Z"),
        },
      ]);

      const versions = await fetchAvailableProjectVersions("TEST");
      expect(versions).toEqual([
        {
          id: "v101",
          name: "1.0.0",
          released: true,
          releaseDate: "2026-10-20",
          startDate: "2026-09-01",
        },
      ]);
    });
  });

  describe("fetchReferenceRelease", () => {
    it("returns null when no matching release found", async () => {
      mocks.releaseFindFirst.mockResolvedValue(null);
      const ref = await fetchReferenceRelease("TEST");
      expect(ref).toBeNull();
    });

    it("returns unreleased release summary", async () => {
      mocks.releaseFindFirst.mockResolvedValue({
        id: "rel-1",
        jiraVersionId: "v101",
        version: "2.0.0",
        releaseDate: new Date("2026-11-01T00:00:00Z"),
      });

      const ref = await fetchReferenceRelease("TEST");
      expect(ref).toEqual({
        id: "v101",
        name: "2.0.0",
        releaseDate: "2026-11-01",
      });
    });
  });
});
