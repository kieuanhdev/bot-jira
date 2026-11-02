import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  findManyIssues: vi.fn(),
  raw: vi.fn(),
  users: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user, findMany: mocks.users },
    issueCache: {
      findMany: mocks.findManyIssues,
    },
    $transaction: (promises: unknown[]) => Promise.all(promises),
    $queryRaw: mocks.raw,
  },
}));
vi.mock("@/lib/jira/project-catalog", () => ({
  listActiveProjects: vi.fn().mockResolvedValue([
    { key: "MR", name: "MR", active: true, syncEnabled: true },
    { key: "EPM", name: "EPM", active: true, syncEnabled: true },
  ]),
  normalizeProjectKey: (k: string) => k.trim().toUpperCase(),
}));

import { GET, _clearFiltersCache } from "./route";

describe("GET /api/issues/filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearFiltersCache();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      boardProjects: ["MR"],
    });
    mocks.users.mockResolvedValue([]);
  });

  it("returns distinct assignees, statuses, labels, and priorities", async () => {
    mocks.findManyIssues
      .mockResolvedValueOnce([{ assigneeJira: "alice" }, { assigneeJira: "bob" }])
      .mockResolvedValueOnce([{ status: "In Progress" }, { status: "Done" }])
      .mockResolvedValueOnce([{ priority: "High" }, { priority: "Medium" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.raw.mockResolvedValueOnce([{ value: "api" }, { value: "backend" }]).mockResolvedValueOnce([]);

    const res = await GET(new Request("http://localhost/api/issues/filters?project=MR"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({
      assignees: ["alice", "bob"],
      statuses: ["Done", "In Progress"],
      labels: ["api", "backend"],
      priorities: ["High", "Medium"],
      epics: [],
      epicTitles: {},
      types: [],
      fixVersions: [],
      reporters: [],
      approvers: [],
      testers: [],
      displayNames: {},
    });
  });

  it("includes standalone epics without child tasks and sorts newest first", async () => {
    mocks.findManyIssues
      .mockResolvedValueOnce([]) // assignees
      .mockResolvedValueOnce([]) // statuses
      .mockResolvedValueOnce([]) // priorities
      .mockResolvedValueOnce([]) // types
      .mockResolvedValueOnce([]) // reporters
      .mockResolvedValueOnce([]) // approvers
      .mockResolvedValueOnce([]) // testers
      .mockResolvedValueOnce([{ epicKey: "MR-10" }]) // referencedEpics from tasks
      .mockResolvedValueOnce([ // epicIssues (standalone or direct epics)
        { jiraKey: "MR-30", summary: "Newest Epic", updatedAt: new Date("2026-11-01T10:00:00Z"), createdAt: new Date("2026-11-01T09:00:00Z") },
        { jiraKey: "MR-20", summary: "Older Epic", updatedAt: new Date("2026-10-15T10:00:00Z"), createdAt: new Date("2026-10-15T09:00:00Z") },
      ])
      .mockResolvedValueOnce([ // missingEpics lookup for MR-10
        { jiraKey: "MR-10", summary: "Referenced Epic Title", updatedAt: new Date("2026-09-01T10:00:00Z"), createdAt: new Date("2026-09-01T09:00:00Z") },
      ]);
    mocks.raw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET(new Request("http://localhost/api/issues/filters?project=MR"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.epics).toEqual(["MR-30", "MR-20", "MR-10"]);
    expect(json.epicTitles).toEqual({
      "MR-30": "Newest Epic",
      "MR-20": "Older Epic",
      "MR-10": "Referenced Epic Title",
    });
  });

  it("returns 404 for unknown project", async () => {
    const res = await GET(new Request("http://localhost/api/issues/filters?project=UNKNOWN"));
    expect(res.status).toBe(404);
  });
});
