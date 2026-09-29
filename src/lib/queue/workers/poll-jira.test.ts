import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  cursorUpsert: vi.fn(),
  cursorUpdate: vi.fn(),
  issueFindUnique: vi.fn(),
  issueUpdateMany: vi.fn(),
  search: vi.fn(),
  getComments: vi.fn(),
  upsertJiraIssue: vi.fn(),
  upsertJiraCommentsWithNew: vi.fn(),
  notifyIssue: vi.fn(),
  notifyComment: vi.fn(),
  getSystemJiraAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      upsert: mocks.cursorUpsert,
      update: mocks.cursorUpdate,
    },
    issueCache: {
      findUnique: mocks.issueFindUnique,
      updateMany: mocks.issueUpdateMany,
    },
  },
}));

vi.mock("@/lib/jira/client", () => ({
  jira: {
    search: mocks.search,
    getComments: mocks.getComments,
  },
  parseJiraDate: (d: string) => (d ? new Date(d) : null),
  getSystemJiraAuth: mocks.getSystemJiraAuth,
}));

vi.mock("@/lib/issues/cache", () => ({
  upsertJiraIssue: mocks.upsertJiraIssue,
  upsertJiraCommentsWithNew: mocks.upsertJiraCommentsWithNew,
}));

vi.mock("@/lib/issues/notify-watchers", () => ({
  notifyWatchersOfIssueChange: mocks.notifyIssue,
  notifyWatchersOfComment: mocks.notifyComment,
}));

import { syncProject, runPollJiraProject } from "./poll-jira";

describe("syncProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemJiraAuth.mockResolvedValue({ user: "jira_user", token: "tok", authMode: "Bearer" });
    mocks.cursorUpsert.mockResolvedValue({
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-29T08:00:00.000Z",
      lastSuccessAt: new Date("2026-09-29T08:00:00.000Z"),
    });
    mocks.cursorUpdate.mockResolvedValue({});
    mocks.issueFindUnique.mockResolvedValue(null);
    mocks.issueUpdateMany.mockResolvedValue({ count: 2 });
    mocks.upsertJiraIssue.mockResolvedValue({ status: "In Progress" });
    mocks.upsertJiraCommentsWithNew.mockResolvedValue({ synced: 1, newComments: [] });
    mocks.notifyIssue.mockResolvedValue(undefined);
    mocks.notifyComment.mockResolvedValue(undefined);
  });

  it("builds incremental JQL scoping to only that project with overlap window", async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-101",
          fields: {
            updated: "2026-09-29T08:10:00.000Z",
            comment: { total: 0, comments: [] },
          },
        },
      ],
    });

    const stats = await syncProject("EPM", false);

    expect(stats.projectKey).toBe("EPM");
    expect(stats.created).toBe(1);
    expect(stats.errors).toHaveLength(0);
    expect(mocks.search).toHaveBeenCalledWith(
      expect.stringContaining("project = EPM AND updated >="),
      50,
      0
    );
    // Overlap should be before 08:00:00 (5 min overlap -> 07:55)
    expect(mocks.search).toHaveBeenCalledWith(
      expect.stringContaining('2026/09/29 07:55'),
      50,
      0
    );
    expect(mocks.cursorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cursor: "2026-09-29T08:10:00.000Z",
          lastSuccessAt: expect.any(Date),
        }),
      })
    );
  });

  it("falls back to full scan safely when cursor is missing or invalid", async () => {
    mocks.cursorUpsert.mockResolvedValue({
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "invalid-not-a-date",
      lastSuccessAt: null,
    });
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-1",
          fields: {
            updated: "2026-09-29T08:00:00.000Z",
            comment: { total: 0, comments: [] },
          },
        },
      ],
    });

    await syncProject("EPM", false);

    // Full scan JQL has no updated >= filter
    expect(mocks.search).toHaveBeenCalledWith(
      expect.not.stringContaining("updated >="),
      50,
      0
    );
    expect(mocks.search).toHaveBeenCalledWith(
      expect.stringContaining("project = EPM"),
      50,
      0
    );
  });

  it("handles multiple pages and advances cursor to newestUpdatedAt", async () => {
    const page1Issues = Array.from({ length: 50 }, (_, i) => ({
      key: `EPM-${i + 1}`,
      fields: { updated: "2026-09-29T08:01:00.000Z", comment: { total: 0, comments: [] } },
    }));

    mocks.search
      .mockResolvedValueOnce({
        total: 51,
        issues: page1Issues,
      })
      .mockResolvedValueOnce({
        total: 51,
        issues: [
          {
            key: "EPM-51",
            fields: { updated: "2026-09-29T08:05:00.000Z", comment: { total: 0, comments: [] } },
          },
        ],
      });

    const stats = await syncProject("EPM", false);

    expect(stats.pages).toBe(2);
    expect(stats.created).toBe(51);
    expect(stats.cursor).toBe("2026-09-29T08:05:00.000Z");
  });

  it("uses embedded comments without calling getComments when comments are complete", async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-5",
          fields: {
            updated: "2026-09-29T08:05:00.000Z",
            comment: {
              total: 1,
              comments: [{ id: "c1", body: "Hello", author: { name: "u" }, created: "2026-09-29T08:00:00.000Z" }],
            },
          },
        },
      ],
    });

    await syncProject("EPM", false);

    expect(mocks.getComments).not.toHaveBeenCalled();
    expect(mocks.upsertJiraCommentsWithNew).toHaveBeenCalledTimes(1);
  });

  it("calls getComments fallback when total comments exceeds available array", async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-6",
          fields: {
            updated: "2026-09-29T08:05:00.000Z",
            comment: {
              total: 15,
              comments: [{ id: "c1", body: "First" }],
            },
          },
        },
      ],
    });
    mocks.getComments.mockResolvedValue([
      { id: "c1", body: "First" },
      { id: "c2", body: "Second" },
    ]);

    await syncProject("EPM", false);

    expect(mocks.getComments).toHaveBeenCalledWith("EPM-6");
  });

  it("does not advance cursor or update lastSuccessAt when an issue upsert fails", async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-7",
          fields: {
            updated: "2026-09-29T08:30:00.000Z",
            comment: { total: 0, comments: [] },
          },
        },
      ],
    });
    mocks.upsertJiraIssue.mockRejectedValue(new Error("DB constraint violation"));

    const stats = await syncProject("EPM", false);

    expect(stats.errors).toHaveLength(1);
    expect(stats.errors[0]).toContain("DB constraint violation");
    expect(stats.cursor).toBe("2026-09-29T08:00:00.000Z"); // unchanged
    expect(mocks.cursorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cursor: "2026-09-29T08:00:00.000Z",
          lastSuccessAt: expect.any(Date), // kept previous
          lastErrorAt: expect.any(Date),
        }),
      })
    );
  });

  it("soft-deletes unseen issues only on successful full scan and only for the target project", async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-1",
          fields: { updated: "2026-09-29T08:00:00.000Z", comment: { total: 0, comments: [] } },
        },
      ],
    });

    await syncProject("EPM", true);

    expect(mocks.issueUpdateMany).toHaveBeenCalledWith({
      where: {
        projectKey: "EPM",
        deletedAt: null,
        jiraKey: { notIn: ["EPM-1"] },
      },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("does not soft-delete unseen issues on full scan if there were errors", async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      issues: [
        {
          key: "EPM-1",
          fields: { updated: "2026-09-29T08:00:00.000Z", comment: { total: 0, comments: [] } },
        },
      ],
    });
    mocks.upsertJiraIssue.mockRejectedValue(new Error("Network glitch"));

    await syncProject("EPM", true);

    expect(mocks.issueUpdateMany).not.toHaveBeenCalled();
  });
});

describe("runPollJiraProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemJiraAuth.mockResolvedValue({ user: "jira_user", token: "tok", authMode: "Bearer" });
    mocks.cursorUpsert.mockResolvedValue({
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-29T08:00:00.000Z",
      lastSuccessAt: new Date(),
    });
    mocks.cursorUpdate.mockResolvedValue({});
    mocks.issueFindUnique.mockResolvedValue(null);
    mocks.search.mockResolvedValue({ total: 0, issues: [] });
  });

  it("returns error if Jira auth is not configured", async () => {
    mocks.getSystemJiraAuth.mockResolvedValue(null);
    const res = await runPollJiraProject({
      projectKey: "EPM",
      full: false,
      source: "manual",
      requestedAt: new Date().toISOString(),
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toContain("Jira not configured");
  });

  it("returns error if projectKey is missing", async () => {
    const res = await runPollJiraProject({
      projectKey: "",
      full: false,
      source: "manual",
      requestedAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
    expect(res.errors?.[0]).toContain("Missing or invalid projectKey");
  });

  it("records queueLagMs and durationMs in stats", async () => {
    const requestedAt = new Date(Date.now() - 500).toISOString();
    const res = await runPollJiraProject({
      projectKey: "EPM",
      full: false,
      source: "manual",
      requestedAt,
    });
    expect(res.ok).toBe(true);
    expect(res.stats?.queueLagMs).toBeGreaterThanOrEqual(400);
    expect(res.stats?.projectKey).toBe("EPM");
    expect(res.stats?.source).toBe("manual");
  });
});
