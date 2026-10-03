import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  releaseFindFirst: vi.fn(),
  issueCacheFindMany: vi.fn(),
  workerHealth: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    release: { findFirst: mocks.releaseFindFirst },
    issueCache: { findMany: mocks.issueCacheFindMany },
  },
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: vi.fn().mockResolvedValue([
      { key: "EPM", name: "EPM Project", active: true, syncEnabled: true },
      { key: "ABC", name: "ABC Project", active: true, syncEnabled: true },
    ]),
  };
});
vi.mock("@/lib/health/worker-health", () => ({
  getWorkerHealth: mocks.workerHealth,
  isJiraFresh: (h: unknown) => (h as { status?: string })?.status === "healthy",
}));

import { GET } from "./route";

describe("GET /api/reports/projects (RPT-104)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u-1", role: "member" } });
    mocks.user.mockResolvedValue({ id: "u-1", boardProjects: ["EPM"] });
    mocks.releaseFindFirst.mockResolvedValue({
      id: "rel-1",
      jiraVersionId: "v101",
      version: "2.4.0",
      releaseDate: new Date("2026-10-30T00:00:00Z"),
      createdAt: new Date("2026-09-01T00:00:00Z"),
    });
    mocks.workerHealth.mockResolvedValue({
      status: "healthy",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 15000,
      checkedAt: new Date().toISOString(),
    });
    mocks.issueCacheFindMany.mockResolvedValue([
      {
        jiraKey: "EPM-1",
        projectKey: "EPM",
        summary: "Task 1",
        status: "Done",
        statusCategory: "done",
        statusChangedAt: new Date(),
        assigneeJira: "alice",
        priority: "High",
        points: 5,
        originalEstimateSeconds: 3600,
        timeSpent: 3600,
        dueDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSyncedAt: new Date(),
        labels: [],
      },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/reports/projects"));
    expect(res.status).toBe(401);
  });

  it("returns portfolio summary and project list within user scope", async () => {
    const res = await GET(new Request("http://localhost/api/reports/projects"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.projects).toBeDefined();
    expect(data.projects.length).toBe(1); // User has boardProjects: ["EPM"]
    expect(data.projects[0].projectKey).toBe("EPM");
    expect(data.projects[0].doneTasks).toBe(1);
    expect(data.projects[0].progress.done).toBe(5);
    expect(data.summary.total).toBe(1);
  });
});
