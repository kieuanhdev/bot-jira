import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  findManyIssues: vi.fn(),
  countIssues: vi.fn(),
  findManyCursors: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: {
      findMany: mocks.findManyIssues,
      count: mocks.countIssues,
    },
    integrationCursor: {
      findMany: mocks.findManyCursors,
    },
    $transaction: (promises: unknown[]) => Promise.all(promises),
  },
}));
vi.mock("@/lib/user-creds", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/user-creds")>();
  return {
    ...mod,
    userJiraUsername: (user: { jiraUsername?: string | null } | null | undefined) => user?.jiraUsername ?? "current_user",
  };
});
vi.mock("@/lib/env", () => ({
  env: {
    jiraFreshnessMinutes: 30,
  },
  isKnownProject: (p: string) => ["MR", "EPM"].includes(p),
  jiraProjectList: ["MR"],
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listActiveProjects: vi.fn().mockResolvedValue([
      { key: "MR", name: "MR", active: true, syncEnabled: true },
      { key: "EPM", name: "EPM", active: true, syncEnabled: true },
    ]),
  };
});

import { GET } from "./route";

describe("GET /api/issues single project board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      jiraUsername: "current_user",
      boardProjects: ["MR"],
    });
    mocks.findManyIssues.mockResolvedValue([]);
    mocks.countIssues.mockResolvedValue(0);
    mocks.findManyCursors.mockResolvedValue([]);
  });

  it("filters by current user aliases when assignee is 'me' (default)", async () => {
    const res = await GET(new Request("http://localhost/api/issues?project=MR"));
    expect(res.status).toBe(200);

    expect(mocks.findManyIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectKey: { in: ["MR"] },
          assigneeJira: { in: ["current_user", "current_user_mb"] },
        }),
      })
    );
  });

  it("does not filter assignee when assignee is 'ALL'", async () => {
    const res = await GET(new Request("http://localhost/api/issues?project=MR&assignee=ALL"));
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.assigneeJira).toBeUndefined();
    expect(callArgs.where.AND).toBeUndefined();
  });

  it("filters by multiple assignees from comma-separated list", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=alice,bob")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.assigneeJira).toEqual({
      in: expect.arrayContaining(["alice", "alice_mb", "bob", "bob_mb"]),
    });
  });

  it("filters by multiple assignees from repeated search params", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=alice&assignee=me")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.assigneeJira).toEqual({
      in: expect.arrayContaining([
        "alice",
        "alice_mb",
        "current_user",
        "current_user_mb",
      ]),
    });
  });

  it("filters by unassigned issues when assignee is 'unassigned'", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=unassigned")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.assigneeJira).toBeNull();
  });

  it("filters by both unassigned and named assignees via OR condition", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=alice,unassigned")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { assigneeJira: { in: expect.arrayContaining(["alice", "alice_mb"]) } },
            { assigneeJira: null },
          ],
        },
      ])
    );
  });

  it("properly combines search query q and assignee filtering without conflicting", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=alice&q=login")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.assigneeJira).toEqual({
      in: expect.arrayContaining(["alice", "alice_mb"]),
    });
    expect(callArgs.where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { jiraKey: { contains: "login", mode: "insensitive" } },
            { summary: { contains: "login", mode: "insensitive" } },
          ],
        },
      ])
    );
  });

  it("ignores legacy boardId param and queries project directly without error", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&boardId=101&assignee=ALL")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.projectKey).toEqual({ in: ["MR"] });
    // Invariant: no where.jiraKey membership filter
    expect(callArgs.where.jiraKey).toBeUndefined();
  });

  it("returns sync freshness information from IntegrationCursor", async () => {
    const successDate = new Date("2026-10-01T12:00:00Z");
    mocks.findManyCursors.mockResolvedValue([
      {
        scope: "MR",
        lastSuccessAt: successDate,
        lastStartedAt: successDate,
        lastError: null,
      },
    ]);

    const res = await GET(new Request("http://localhost/api/issues?project=MR&assignee=ALL"));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.sync.projects).toEqual(["MR"]);
    expect(json.sync.lastSuccessAt).toBe(successDate.toISOString());
    expect(json.sync.errors).toEqual([]);
  });

  it("filters by multiple statuses using in condition", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=ALL&status=In%20Progress,Review")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.status).toEqual({ in: ["In Progress", "Review"] });
  });

  it("filters by multiple priorities using in condition", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=ALL&priority=High,Highest")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.priority).toEqual({ in: ["High", "Highest"] });
  });

  it("filters by multiple labels using hasSome condition (OR semantics)", async () => {
    const res = await GET(
      new Request("http://localhost/api/issues?project=MR&assignee=ALL&label=backend,api")
    );
    expect(res.status).toBe(200);

    const callArgs = mocks.findManyIssues.mock.calls[0][0];
    expect(callArgs.where.labels).toEqual({ hasSome: ["backend", "api"] });
  });

  it("does not also require assignee = me when a role filter is given", async () => {
    await GET(new Request("http://localhost/api/issues?project=MR&role=tester"));
    const { where } = mocks.findManyIssues.mock.calls[0][0];
    expect(where.assigneeJira).toBeUndefined();
    expect(where.AND).toEqual([
      { OR: [{ testerJira: { in: ["current_user", "current_user_mb"] } }] },
    ]);
  });

  it("excludes done tasks from the stale and unestimated quick filters", async () => {
    await GET(new Request("http://localhost/api/issues?project=MR&assignee=ALL&staleDays=7&unestimated=1&includeDone=1"));
    const { where } = mocks.findManyIssues.mock.calls[0][0];
    expect(where.AND).toEqual(expect.arrayContaining([{ statusCategory: { not: "done" } }]));
    expect(where.originalEstimateSeconds).toBeNull();
  });

  it("does not treat a task due today as overdue", async () => {
    await GET(new Request("http://localhost/api/issues?project=MR&assignee=ALL&overdue=1"));
    const { where } = mocks.findManyIssues.mock.calls[0][0];
    const cond = where.AND.find((c: { dueDate?: unknown }) => c.dueDate) as { dueDate: { lt: Date } };
    const today = new Date();
    expect(cond.dueDate.lt.toISOString()).toBe(
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString()
    );
  });

  it("returns 400 when facet value count exceeds limit 50", async () => {
    const many = Array.from({ length: 55 }, (_, i) => `user_${i}`).join(",");
    const res = await GET(
      new Request(`http://localhost/api/issues?project=MR&assignee=${many}`)
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Too many filter values");
  });

  it("returns 404 when requested project does not exist in catalog", async () => {
    const res = await GET(new Request("http://localhost/api/issues?project=NONEXISTENT"));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("không tồn tại");
  });
});
