import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getTasks } from "./tasks/route";
import { GET as getMembers } from "./members/route";
import { GET as getHistory } from "./history/route";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  issueCache: vi.fn(),
  release: vi.fn(),
  jiraProject: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: () => mocks.session(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: () => mocks.user(),
      findMany: () => Promise.resolve([]),
    },
    issueCache: {
      findMany: () => mocks.issueCache(),
      count: () => Promise.resolve(0),
    },
    release: {
      findMany: () => mocks.release(),
      findFirst: () => Promise.resolve(null),
    },
    jiraProject: {
      findMany: () => mocks.jiraProject(),
    },
  },
}));

vi.mock("@/lib/jira/project-catalog", () => ({
  listActiveProjects: () =>
    Promise.resolve([
      { key: "EPM", name: "Enterprise Project Management", active: true, syncEnabled: true },
    ]),
  normalizeProjectKey: (k: string) => k.toUpperCase().trim(),
}));

describe("Reporting sub-routes (tasks, members, history)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "u-1", role: "member", displayName: "Tester" },
    });
    mocks.user.mockResolvedValue({
      id: "u-1",
      role: "member",
      boardProjects: ["EPM"],
    });
    mocks.release.mockResolvedValue([]);
    mocks.jiraProject.mockResolvedValue([]);
    mocks.issueCache.mockResolvedValue([
      {
        jiraKey: "EPM-1",
        projectKey: "EPM",
        summary: "Setup architecture",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date("2026-10-02T10:00:00Z"),
        assigneeJira: "alice",
        priority: "High",
        points: 5,
        originalEstimateSeconds: 14400,
        dueDate: null,
        createdAt: new Date("2026-10-01T08:00:00Z"),
        updatedAt: new Date("2026-10-02T10:00:00Z"),
        labels: [],
        raw: {},
        fixVersionNames: [],
      },
    ]);
  });

  it("GET /tasks returns tasks for project and period", async () => {
    const res = await getTasks(new Request("http://localhost/api/reports/projects/EPM/tasks?period=this_week"), {
      params: Promise.resolve({ projectKey: "EPM" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tasks).toBeDefined();
    expect(data.tasks.length).toBe(1);
    expect(data.tasks[0].jiraKey).toBe("EPM-1");
    expect(data.period).toBeDefined();
  });

  it("GET /members returns member contribution and load without rankings", async () => {
    const res = await getMembers(new Request("http://localhost/api/reports/projects/EPM/members?period=this_week"), {
      params: Promise.resolve({ projectKey: "EPM" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.members).toBeDefined();
    expect(data.members.length).toBe(1);
    expect(data.members[0].assignee).toBe("alice");
    expect(data.members[0].completedTasks).toBe(1);
    expect(data.members[0].supportSignal).toBeDefined();
    // Verify no rank or score in contract
    expect((data.members[0] as Record<string, unknown>).rank).toBeUndefined();
    expect((data.members[0] as Record<string, unknown>).score).toBeUndefined();
  });

  it("GET /history returns trend data points", async () => {
    const res = await getHistory(new Request("http://localhost/api/reports/projects/EPM/history?period=this_week"), {
      params: Promise.resolve({ projectKey: "EPM" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dataPoints).toBeDefined();
    expect(Array.isArray(data.dataPoints)).toBe(true);
    expect(data.projectKey).toBe("EPM");
  });
});
