import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  issueCacheFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findMany: mocks.issueCacheFindMany },
  },
}));

vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: vi.fn().mockResolvedValue([
      { key: "EPM", name: "EPM", active: true, syncEnabled: true },
    ]),
  };
});


vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isKnownProject: (key: string) => key.toUpperCase() === "EPM",
    jiraProjectList: ["EPM"],
  };
});


import { getStaleData, executeStaleQuery } from "./query";
import { parseStaleQueryParams } from "./params";

describe("getStaleData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({
      id: "u-1",
      boardProjects: ["EPM"],
      jiraUsername: "alice",
    });
  });

  it("serializes Date objects to ISO strings for exact JSON parity", async () => {
    const fixedDate = new Date("2026-10-10T08:00:00.000Z");
    const tenDaysAgo = new Date(fixedDate.getTime() - 10 * 24 * 60 * 60 * 1000);
    mocks.issueCacheFindMany.mockResolvedValue([
      {
        jiraKey: "EPM-1",
        projectKey: "EPM",
        summary: "Task 1",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: tenDaysAgo,
        assigneeJira: "alice",
        labels: [],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "High",
        points: 3,
        originalEstimateSeconds: 3600,
        type: "Story",
        dueDate: fixedDate,
        timeSpent: 1800,
        createdAt: tenDaysAgo,
        updatedAt: tenDaysAgo,
        lastSyncedAt: fixedDate,
      },
    ]);


    const params = parseStaleQueryParams("http://localhost/api/stale?assignee=me");
    const raw = await executeStaleQuery({ id: "u-1", jiraUsername: "alice" }, params, fixedDate);
    // Raw output has Date instances
    expect(raw.tasks[0]?.updatedAt).toBeInstanceOf(Date);

    const serialized = await getStaleData({ id: "u-1", jiraUsername: "alice" }, params, fixedDate);
    // getStaleData outputs ISO strings
    expect(typeof serialized.tasks[0]?.updatedAt).toBe("string");
    expect(serialized.tasks[0]?.updatedAt).toBe(tenDaysAgo.toISOString());
    expect(serialized.tasks[0]?.statusChangedAt).toBe(tenDaysAgo.toISOString());
    expect(serialized.tasks[0]?.createdAt).toBe(tenDaysAgo.toISOString());

  });

  it("handles empty issues list gracefully", async () => {
    mocks.issueCacheFindMany.mockResolvedValue([]);
    const params = parseStaleQueryParams("http://localhost/api/stale");
    const res = await getStaleData({ id: "u-1", jiraUsername: "alice" }, params);

    expect(res.tasks).toEqual([]);
    expect(res.summary.totalActive).toBe(0);
    expect(res.myWork.tasks).toEqual([]);
  });
});
