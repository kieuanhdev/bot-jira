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
vi.mock("@/lib/env", () => ({
  env: { jiraFreshnessMinutes: 30 },
  isKnownProject: (p: string) => ["MR", "EPM"].includes(p),
  jiraProjectList: ["MR"],
}));

import { GET } from "./route";

describe("GET /api/issues multi-assignee filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      jiraUsername: "current_user",
      jiraUserEnc: null,
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
});
