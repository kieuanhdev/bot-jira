import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  releaseFindMany: vi.fn(),
  issueCacheFindMany: vi.fn(),
  issueTransitionEventFindMany: vi.fn(),
  workerHealth: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    release: { findMany: mocks.releaseFindMany },
    issueCache: { findMany: mocks.issueCacheFindMany },
    issueTransitionEvent: { findMany: mocks.issueTransitionEventFindMany },
  },
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: vi.fn().mockResolvedValue([
      { key: "EPM", name: "EPM Project", active: true, syncEnabled: true },
      { key: "OTHER", name: "Other Project", active: true, syncEnabled: true },
    ]),
  };
});
vi.mock("@/lib/health/worker-health", () => ({
  getWorkerHealth: mocks.workerHealth,
  isJiraFresh: (h: unknown) => (h as { status?: string })?.status === "healthy",
}));

import { GET } from "./route";

describe("GET /api/reports/projects/[projectKey] (RPT-105)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u-1", role: "member" } });
    mocks.user.mockResolvedValue({ id: "u-1", boardProjects: ["EPM"] });
    mocks.issueTransitionEventFindMany.mockResolvedValue([]);
    mocks.releaseFindMany.mockResolvedValue([
      {
        id: "rel-1",
        jiraVersionId: "v101",
        version: "2.4.0",
        releaseDate: new Date("2026-10-30T00:00:00Z"),
        status: "ready",
        createdAt: new Date("2026-09-01T00:00:00Z"),
      },
    ]);
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
        summary: "Important Task",
        status: "In Progress",
        statusCategory: "indeterminate",
        statusChangedAt: new Date(),
        assigneeJira: "bob",
        priority: "High",
        points: 3,
        originalEstimateSeconds: 7200,
        timeSpent: 0,
        dueDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        labels: [],
      },
    ]);
  });

  it("returns 403 when project is not in user's allowed scope", async () => {
    mocks.user.mockResolvedValue({ id: "u-1", boardProjects: ["OTHER"] });
    const res = await GET(new Request("http://localhost/api/reports/projects/EPM"), {
      params: Promise.resolve({ projectKey: "EPM" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns project detail when allowed", async () => {
    const res = await GET(new Request("http://localhost/api/reports/projects/EPM"), {
      params: Promise.resolve({ projectKey: "EPM" }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.projectKey).toBe("EPM");
    expect(data.kpis).toBeDefined();
    expect(data.statusDistribution).toBeDefined();
    expect(data.workload).toBeDefined();
    expect(data.bottlenecks).toBeDefined();
  });
});
