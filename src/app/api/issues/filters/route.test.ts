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

import { GET } from "./route";

describe("GET /api/issues/filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      types: [],
      fixVersions: [],
      reporters: [],
      approvers: [],
      testers: [],
      displayNames: {},
    });
  });

  it("returns 404 for unknown project", async () => {
    const res = await GET(new Request("http://localhost/api/issues/filters?project=UNKNOWN"));
    expect(res.status).toBe(404);
  });
});
