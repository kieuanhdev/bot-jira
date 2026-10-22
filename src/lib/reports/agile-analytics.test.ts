import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  releaseFindUnique: vi.fn(),
  releaseFindFirst: vi.fn(),
  releaseFindMany: vi.fn(),
  issueCacheFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    release: {
      findUnique: mocks.releaseFindUnique,
      findFirst: mocks.releaseFindFirst,
      findMany: mocks.releaseFindMany,
    },
    issueCache: {
      findMany: mocks.issueCacheFindMany,
    },
  },
}));

import { getBurndownData, getCFDData, getReleaseComparisons } from "./agile-analytics";

describe("agile-analytics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBurndownData", () => {
    it("returns burndown points with ideal and actual decrement", async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const targetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      mocks.releaseFindFirst.mockResolvedValueOnce({
        id: "rel-1",
        version: "v1.0.0",
        projectKey: "DEMO",
        createdAt: startDate,
        releaseDate: targetDate,
        status: "ready",
        tasks: [{ jiraKey: "DEMO-1" }, { jiraKey: "DEMO-2" }],
      });

      mocks.issueCacheFindMany.mockResolvedValueOnce([
        {
          jiraKey: "DEMO-1",
          points: 5,
          status: "Done",
          statusCategory: "done",
          completedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          createdAt: startDate,
        },
        {
          jiraKey: "DEMO-2",
          points: 3,
          status: "In Progress",
          statusCategory: "indeterminate",
          completedAt: null,
          createdAt: startDate,
        },
      ]);

      const res = await getBurndownData("DEMO");

      expect(res.release?.version).toBe("v1.0.0");
      expect(res.release?.totalPoints).toBe(8);
      expect(res.points.length).toBeGreaterThan(0);
      expect(res.points[0].ideal).toBe(8);
    });
  });

  describe("getCFDData", () => {
    it("returns cumulative flow diagram points across status layers", async () => {
      const now = new Date();
      mocks.issueCacheFindMany.mockResolvedValueOnce([
        {
          jiraKey: "DEMO-1",
          status: "Done",
          statusCategory: "done",
          createdAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          completedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        },
        {
          jiraKey: "DEMO-2",
          status: "In Progress",
          statusCategory: "indeterminate",
          createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
          completedAt: null,
        },
      ]);

      const points = await getCFDData("DEMO", 14);

      expect(points.length).toBeGreaterThan(0);
      const lastPoint = points[points.length - 1];
      expect(lastPoint.toDo).toBeGreaterThanOrEqual(lastPoint.inProgress);
      expect(lastPoint.inProgress).toBeGreaterThanOrEqual(lastPoint.done);
    });
  });

  describe("getReleaseComparisons", () => {
    it("aggregates release comparison items", async () => {
      mocks.releaseFindMany.mockResolvedValueOnce([
        {
          id: "r1",
          version: "v1.1",
          status: "released",
          releaseDate: new Date(),
          tasks: [{ jiraKey: "T1" }],
        },
      ]);

      mocks.issueCacheFindMany.mockResolvedValueOnce([
        { points: 5, status: "Done", statusCategory: "done" },
      ]);

      const res = await getReleaseComparisons("DEMO");

      expect(res.length).toBe(1);
      expect(res[0].version).toBe("v1.1");
      expect(res[0].completionRate).toBe(100);
      expect(res[0].completedPoints).toBe(5);
    });
  });
});
