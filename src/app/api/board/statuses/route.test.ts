import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getProjectWorkflowConfig: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/jira/project-workflow-store", () => ({
  getProjectWorkflowConfig: mocks.getProjectWorkflowConfig,
}));
vi.mock("@/lib/env", () => ({
  isKnownProject: (p: string) => ["EPM", "ETM"].includes(p),
  jiraProjectList: ["EPM"],
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: vi.fn().mockResolvedValue([
      { key: "EPM", name: "EPM", active: true, syncEnabled: true },
      { key: "ETM", name: "ETM", active: true, syncEnabled: true },
    ]),
  };
});

import { GET } from "./route";

describe("GET /api/board/statuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      boardProjects: ["EPM"],
    });
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/board/statuses?project=EPM"));
    expect(res.status).toBe(401);
  });

  it("returns resolved workflow config for single project from DB", async () => {
    const mockWorkflowConfig = {
      projectKey: "EPM",
      source: "project_workflow",
      fetchedAt: new Date().toISOString(),
      columns: [
        {
          id: "status:10000",
          name: "Backlog",
          statusIds: ["10000"],
          statuses: [{ id: "10000", name: "Backlog" }],
          category: "new",
          isDone: false,
        },
        {
          id: "status:10001",
          name: "Done",
          statusIds: ["10001"],
          statuses: [{ id: "10001", name: "Done" }],
          category: "done",
          isDone: true,
        },
      ],
      statusCategoryMap: { Backlog: "new", Done: "done" },
    };
    mocks.getProjectWorkflowConfig.mockResolvedValue(mockWorkflowConfig);

    const res = await GET(new Request("http://localhost/api/board/statuses?project=EPM"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.source).toBe("project_workflow");
    expect(json.columns).toHaveLength(2);
    expect(json.backlogColumnId).toBe("status:10000");
    expect(json.backlogStatusIds).toEqual(["10000"]);
    expect(json.items).toBeDefined();
    expect(json.statusCategoryMap).toBeDefined();
    expect(mocks.getProjectWorkflowConfig).toHaveBeenCalledWith("EPM");
  });

  it("returns merged columns for multiple projects", async () => {
    mocks.getProjectWorkflowConfig.mockImplementation(async (key: string) => ({
      projectKey: key,
      source: "project_workflow",
      fetchedAt: new Date().toISOString(),
      columns: [
        {
          id: `status:${key}_10`,
          name: "In Progress",
          statusIds: [`${key}_10`],
          statuses: [{ id: `${key}_10`, name: "In Progress" }],
          category: "indeterminate",
          isDone: false,
        },
      ],
      statusCategoryMap: { "In Progress": "indeterminate" },
    }));

    const res = await GET(new Request("http://localhost/api/board/statuses?projectList=EPM,ETM"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.source).toBe("project_workflow");
    expect(json.columns).toHaveLength(1);
    expect(json.columns[0].name).toBe("In Progress");
    expect(json.columns[0].statusIds).toContain("EPM_10");
    expect(json.columns[0].statusIds).toContain("ETM_10");
  });
});
