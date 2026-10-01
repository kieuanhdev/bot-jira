import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  issueCacheFindMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findMany: mocks.issueCacheFindMany },
  },
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isKnownProject: (key: string) => ["EPM", "MHRM"].includes(key.toUpperCase()),
    jiraProjectList: ["EPM", "MHRM"],
  };
});
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: vi.fn().mockResolvedValue([
      { key: "EPM", name: "EPM", active: true, syncEnabled: true },
      { key: "MHRM", name: "MHRM", active: true, syncEnabled: true },
    ]),
  };
});

import { GET } from "./route";

describe("GET /api/stale standardization integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", jiraUsername: "alice" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      boardProjects: ["EPM", "MHRM"],
      jiraUsername: "alice",
    });
  });

  it("returns 401 when user is not authenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/stale"));
    expect(res.status).toBe(401);
  });

  it("evaluates standardization on user tasks independently from stale status", async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    mocks.issueCacheFindMany.mockResolvedValue([
      // Task 1: Complete and NOT stale
      {
        jiraKey: "EPM-101",
        projectKey: "EPM",
        summary: "Login redesign",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: twoDaysAgo,
        assigneeJira: "alice",
        labels: ["flow-feature"],
        fixVersionIds: ["v1"],
        fixVersionNames: ["v1.0.0"],
        priority: "High",
        points: 5,
        originalEstimateSeconds: 14400,
        type: "Story",
        dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
        timeSpent: 3600,
        createdAt: tenDaysAgo,
        updatedAt: twoDaysAgo,
        lastSyncedAt: now,
      },
      // Task 2: Incomplete and NOT stale (missing estimation & fix version)
      {
        jiraKey: "EPM-102",
        projectKey: "EPM",
        summary: "Button tweak",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: twoDaysAgo,
        assigneeJira: "alice",
        labels: ["flow-feature"],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "Medium",
        points: null,
        originalEstimateSeconds: null,
        type: "Task",
        dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        timeSpent: 1800,
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo,
        lastSyncedAt: now,
      },
      // Task 3: Complete and STALE (in progress for 10 days, SLA is ~5 days)
      {
        jiraKey: "EPM-103",
        projectKey: "EPM",
        summary: "Database migration",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: tenDaysAgo,
        assigneeJira: "alice",
        labels: ["flow-feature"],
        fixVersionIds: ["v1"],
        fixVersionNames: ["v1.0.0"],
        priority: "High",
        points: 8,
        originalEstimateSeconds: 28800,
        type: "Story",
        dueDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        timeSpent: 7200,
        createdAt: tenDaysAgo,
        updatedAt: tenDaysAgo,
        lastSyncedAt: now,
      },
      // Task 4: Incomplete and STALE (maintenance work missing worklog and fix version)
      {
        jiraKey: "MHRM-201",
        projectKey: "MHRM",
        summary: "Fix crash on reload",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: tenDaysAgo,
        assigneeJira: "alice",
        labels: ["flow-bug"],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "Critical",
        points: null,
        originalEstimateSeconds: null,
        type: "Bug",
        dueDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
        timeSpent: 0,
        createdAt: tenDaysAgo,
        updatedAt: tenDaysAgo,
        lastSyncedAt: now,
      },
      // Task 5: Belonging to bob (should not appear in alice's myWork)
      {
        jiraKey: "EPM-105",
        projectKey: "EPM",
        summary: "Bob task",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: twoDaysAgo,
        assigneeJira: "bob",
        labels: ["flow-feature"],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "Low",
        points: null,
        originalEstimateSeconds: null,
        type: "Task",
        dueDate: null,
        timeSpent: 0,
        createdAt: twoDaysAgo,
        updatedAt: twoDaysAgo,
        lastSyncedAt: now,
      },
    ]);

    const res = await GET(new Request("http://localhost/api/stale?assignee=me"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.myWork).toBeDefined();
    expect(data.myWork.username).toBe("alice");
    expect(data.myWork.totalActive).toBe(4); // EPM-101, EPM-102, EPM-103, MHRM-201

    const std = data.myWork.standardization;
    expect(std).toBeDefined();
    // EPM-101 and EPM-103 are complete -> 2 complete
    expect(std.complete).toBe(2);
    // EPM-102 and MHRM-201 are incomplete -> 2 incomplete
    expect(std.incomplete).toBe(2);
    expect(std.unknown).toBe(0);
    expect(std.complete + std.incomplete + std.unknown).toBe(data.myWork.totalActive);

    // Missing counts:
    // EPM-102 (flow-feature) misses: ESTIMATION, FIX_VERSION
    // MHRM-201 (flow-bug) misses: WORKLOG, FIX_VERSION (ESTIMATION is exempt for maintenance!)
    expect(std.missingCounts.ESTIMATION).toBe(1);
    expect(std.missingCounts.FIX_VERSION).toBe(2);
    expect(std.missingCounts.WORKLOG).toBe(1);
    expect(std.missingCounts.DUE_DATE).toBe(0);

    type TaskItem = {
      jiraKey: string;
      isStale: boolean;
      policyId: string;
      missing: string[];
    };

    // Only incomplete/unknown tasks in the standardization actionable queue
    expect(std.tasks).toHaveLength(2);
    const keys = std.tasks.map((t: TaskItem) => t.jiraKey);
    expect(keys).toContain("EPM-102");
    expect(keys).toContain("MHRM-201");
    expect(keys).not.toContain("EPM-101");
    expect(keys).not.toContain("EPM-103");

    // EPM-102 is NOT stale but IS in standardization queue
    const t102 = std.tasks.find((t: TaskItem) => t.jiraKey === "EPM-102");
    expect(t102.isStale).toBe(false);
    expect(t102.missing).toEqual(expect.arrayContaining(["ESTIMATION", "FIX_VERSION"]));

    // MHRM-201 is STALE and IS in standardization queue
    const t201 = std.tasks.find((t: TaskItem) => t.jiraKey === "MHRM-201");
    expect(t201.isStale).toBe(true);
    expect(t201.policyId).toBe("maintenance-work");
    expect(t201.missing).toEqual(expect.arrayContaining(["WORKLOG", "FIX_VERSION"]));
    expect(t201.missing).not.toContain("ESTIMATION");
  });

  it("handles unconfigured jiraUsername gracefully", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-2", jiraUsername: null } });
    mocks.user.mockResolvedValue({
      id: "user-2",
      boardProjects: ["EPM"],
      jiraUsername: null,
    });
    mocks.issueCacheFindMany.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/stale?assignee=me"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.myWork.username).toBeNull();
    expect(data.myWork.totalActive).toBe(0);
    expect(data.myWork.totalStale).toBe(0);
    expect(data.myWork.standardization.complete).toBe(0);
    expect(data.myWork.standardization.incomplete).toBe(0);
    expect(data.myWork.standardization.tasks).toHaveLength(0);
  });
});

