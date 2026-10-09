import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSentryImport } from "./sentry-import";
import { prisma } from "@/lib/prisma";
import { sentry, type SentryIssue } from "@/lib/sentry/client";
import { jira } from "@/lib/jira/client";
import * as guardModule from "../guard";
import * as jiraClientModule from "@/lib/jira/client";
import * as projectCatalogModule from "@/lib/jira/project-catalog";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sentryIssueImported: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    issueCache: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sentry/client", () => ({
  sentry: {
    listUnresolvedIssues: vi.fn(),
    getIssue: vi.fn(),
  },
}));

vi.mock("@/lib/jira/client", () => ({
  jira: {
    search: vi.fn(),
    createIssue: vi.fn(),
    getIssue: vi.fn(),
  },
  hasJiraCredentials: vi.fn(),
}));

vi.mock("@/lib/issues/cache", () => ({
  upsertJiraIssue: vi.fn(),
}));

vi.mock("@/lib/jira/project-catalog", () => ({
  listSyncEnabledProjectKeys: vi.fn(),
}));

describe("runSentryImport worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guardModule, "hasSentryConfig").mockReturnValue(true);
    vi.spyOn(jiraClientModule, "hasJiraCredentials").mockResolvedValue(true);
    vi.mocked(projectCatalogModule.listSyncEnabledProjectKeys).mockResolvedValue(["EPM"]);
  });

  it("returns guard skipped status when Sentry is not configured", async () => {
    vi.spyOn(guardModule, "hasSentryConfig").mockReturnValue(false);

    const result = await runSentryImport();
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("Sentry not configured");
  });

  it("returns guard skipped status when Jira credentials are missing", async () => {
    vi.spyOn(jiraClientModule, "hasJiraCredentials").mockResolvedValue(false);

    const result = await runSentryImport();
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("Jira not configured");
  });

  it("skips issues that are already created or ignored (idempotency)", async () => {
    const fakeIssues: SentryIssue[] = [
      { id: 101, shortId: "APP-101", title: "Err 1" },
      { id: 102, shortId: "APP-102", title: "Err 2" },
    ];
    vi.mocked(sentry.listUnresolvedIssues).mockResolvedValue(fakeIssues);

    // Issue 101 is already created
    vi.mocked(prisma.sentryIssueImported.findUnique)
      .mockResolvedValueOnce({
        id: "rec-1",
        sentryProject: "default-project",
        sentryIssueId: "101",
        jiraKey: "EPM-101",
        state: "created",
        attemptCount: 1,
        lastError: null,
        lastAttemptAt: new Date(),
        importedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      // Issue 102 is marked ignored
      .mockResolvedValueOnce({
        id: "rec-2",
        sentryProject: "default-project",
        sentryIssueId: "102",
        jiraKey: null,
        state: "ignored",
        attemptCount: 1,
        lastError: "unmapped",
        lastAttemptAt: new Date(),
        importedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const result = await runSentryImport();

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ imported: 0, recovered: 0, failed: 0 });
    expect(jira.createIssue).not.toHaveBeenCalled();
    expect(prisma.sentryIssueImported.upsert).not.toHaveBeenCalled();
  });

  it("recovers an existing Jira issue by label without creating a new one", async () => {
    const fakeIssue: SentryIssue = {
      id: 201,
      shortId: "APP-201",
      title: "Null pointer exception",
      project: { slug: "mobile-app" },
    };
    vi.mocked(sentry.listUnresolvedIssues).mockResolvedValue([fakeIssue]);

    // DB has no completed record
    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValue(null);

    // Search by label finds an existing Jira issue
    vi.mocked(jira.search).mockResolvedValue({
      issues: [
        {
          id: "10001",
          key: "EPM-777",
          self: "https://jira.example/issue/10001",
          fields: {
            summary: "Existing bug",
            description: "",
            labels: ["sentry", "sentry-id-201"],
            status: { name: "Open", statusCategory: { name: "To Do" } },
            issuetype: { name: "Bug" },
            priority: { name: "High" },
          },
        },
      ],
      total: 1,
      startAt: 0,
      maxResults: 1,
    });

    vi.mocked(prisma.issueCache.findUnique).mockResolvedValue({
      id: "cache-1",
      jiraKey: "EPM-777",
    } as unknown as import("@prisma/client").IssueCache);

    const result = await runSentryImport();

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ imported: 1, recovered: 1, failed: 0 });
    expect(jira.createIssue).not.toHaveBeenCalled();
    expect(prisma.sentryIssueImported.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sentryIssueId: "201",
          jiraKey: "EPM-777",
          state: "created",
        }),
      })
    );
  });

  it("creates a new Jira bug when issue is fresh and maps properly", async () => {
    const fakeIssue: SentryIssue = {
      id: 301,
      shortId: "APP-301",
      title: "Payment timeout",
      permalinkUrl: "https://sentry.io/issues/301",
      level: "fatal",
      count: 42,
      firstSeen: "2026-10-01T00:00:00Z",
      latestEvent: "2026-10-09T00:00:00Z",
      project: { slug: "mobile-app" },
    };
    vi.mocked(sentry.listUnresolvedIssues).mockResolvedValue([fakeIssue]);
    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValue(null);
    vi.mocked(jira.search).mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 1 });
    vi.mocked(jira.createIssue).mockResolvedValue({
      id: "10002",
      key: "EPM-888",
      self: "https://jira.example/issue/10002",
    });

    const result = await runSentryImport();

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ imported: 1, recovered: 0, failed: 0 });
    expect(jira.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "[Sentry] APP-301: Payment timeout",
        issueType: "Bug",
        labels: ["sentry", "sentry-id-301"],
      })
    );
    expect(prisma.sentryIssueImported.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sentryIssueId: "301",
          jiraKey: "EPM-888",
          state: "created",
        }),
      })
    );
  });

  it("handles retryable failure and transitions to failed state after max attempts", async () => {
    const fakeIssue: SentryIssue = {
      id: 401,
      shortId: "APP-401",
      title: "Broken route",
    };
    vi.mocked(sentry.listUnresolvedIssues).mockResolvedValue([fakeIssue]);

    // Already attempted 4 times
    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValue({
      id: "rec-401",
      sentryProject: "default-project",
      sentryIssueId: "401",
      jiraKey: null,
      state: "pending",
      attemptCount: 4,
      lastError: "Previous timeout",
      lastAttemptAt: new Date(Date.now() - 500_000),
      importedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(jira.search).mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 1 });
    vi.mocked(jira.createIssue).mockRejectedValue(new Error("Jira API 500"));

    const result = await runSentryImport();

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ imported: 0, recovered: 0, failed: 1 });
    expect(result.errors?.length).toBe(1);
    expect(prisma.sentryIssueImported.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          state: "failed", // 4 + 1 = 5 >= MAX_ATTEMPTS
          attemptCount: 5,
        }),
      })
    );
  });
});
