import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSentryImport } from "./sentry-import";
import { prisma } from "@/lib/prisma";
import { sentry, type SentryIssue } from "@/lib/sentry/client";
import { seedSentryIssue } from "@/lib/sentry/review-queue";
import { jira } from "@/lib/jira/client";
import * as guardModule from "../guard";
import * as jiraClientModule from "@/lib/jira/client";
import * as projectCatalogModule from "@/lib/jira/project-catalog";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sentryIssueImported: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
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

vi.mock("@/lib/sentry/review-queue", () => ({
  seedSentryIssue: vi.fn(),
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
    vi.mocked(sentry.listUnresolvedIssues).mockResolvedValue([]);
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValue([]);
    vi.mocked(prisma.sentryIssueImported.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(jira.search).mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 1 });
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

  it("seeds unresolved Sentry issues into the review queue without filing them", async () => {
    const fakeIssues: SentryIssue[] = [
      { id: 101, shortId: "APP-101", title: "Err 1" },
      { id: 102, shortId: "APP-102", title: "Err 2" },
    ];
    vi.mocked(sentry.listUnresolvedIssues).mockResolvedValue(fakeIssues);

    const result = await runSentryImport();

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ discovered: 2, imported: 0, recovered: 0, failed: 0 });
    expect(seedSentryIssue).toHaveBeenCalledTimes(2);
    expect(seedSentryIssue).toHaveBeenCalledWith(fakeIssues[0]);
    expect(jira.createIssue).not.toHaveBeenCalled();
  });

  it("only files approved rows and failed rows", async () => {
    await runSentryImport();

    const states = vi.mocked(prisma.sentryIssueImported.findMany).mock.calls.map((c) => c[0]?.where?.state);
    expect(states).toEqual(["approved", "failed"]);
  });

  it("creates a Jira bug for an approved row from its snapshot", async () => {
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValueOnce([
      row({
        sentryIssueId: "301",
        shortId: "APP-301",
        title: "Payment timeout",
        permalinkUrl: "https://sentry.io/issues/301",
        level: "fatal",
        eventCount: 42,
        targetProject: "EPM",
      }),
    ]);
    vi.mocked(jira.createIssue).mockResolvedValue({
      id: "10002",
      key: "EPM-888",
      self: "https://jira.example/issue/10002",
    });

    const result = await runSentryImport();

    expect(result.ok).toBe(true);
    expect(result.stats).toEqual({ discovered: 0, imported: 1, recovered: 0, failed: 0 });
    expect(jira.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "EPM",
        summary: "[Sentry] APP-301: Payment timeout",
        issueType: "Bug",
        labels: ["sentry", "sentry-id-301"],
      })
    );
    expect(prisma.sentryIssueImported.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: expect.objectContaining({ jiraKey: "EPM-888", state: "created", lastError: null }),
    });
  });

  it("recovers an existing Jira issue by label without creating a new one", async () => {
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValueOnce([
      row({ sentryIssueId: "201", targetProject: "EPM" }),
    ]);
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

    expect(result.stats).toEqual({ discovered: 0, imported: 0, recovered: 1, failed: 0 });
    expect(jira.createIssue).not.toHaveBeenCalled();
    expect(prisma.sentryIssueImported.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: expect.objectContaining({ jiraKey: "EPM-777", state: "created" }),
    });
  });

  it("skips a row another run already claimed", async () => {
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValueOnce([row({ targetProject: "EPM" })]);
    vi.mocked(prisma.sentryIssueImported.updateMany).mockResolvedValue({ count: 0 });

    const result = await runSentryImport();

    expect(result.stats).toEqual({ discovered: 0, imported: 0, recovered: 0, failed: 0 });
    expect(jira.createIssue).not.toHaveBeenCalled();
  });

  it("keeps a failed row in backoff untouched", async () => {
    vi.mocked(prisma.sentryIssueImported.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row({ state: "failed", attemptCount: 5, lastAttemptAt: new Date() })]);

    await runSentryImport();

    expect(prisma.sentryIssueImported.updateMany).not.toHaveBeenCalled();
    expect(jira.createIssue).not.toHaveBeenCalled();
  });

  it("keeps a row approved on a retryable failure", async () => {
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValueOnce([
      row({ targetProject: "EPM", attemptCount: 1 }),
    ]);
    vi.mocked(jira.createIssue).mockRejectedValue(new Error("Jira API 500"));

    const result = await runSentryImport();

    expect(result.stats).toEqual({ discovered: 0, imported: 0, recovered: 0, failed: 0 });
    expect(prisma.sentryIssueImported.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: expect.objectContaining({ state: "approved", attemptCount: 2, lastError: "Jira API 500" }),
    });
  });

  it("transitions to failed after max attempts", async () => {
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValueOnce([
      row({ targetProject: "EPM", attemptCount: 4 }),
    ]);
    vi.mocked(jira.createIssue).mockRejectedValue(new Error("Jira API 500"));

    const result = await runSentryImport();

    expect(result.stats).toEqual({ discovered: 0, imported: 0, recovered: 0, failed: 1 });
    expect(result.errors?.length).toBe(1);
    expect(prisma.sentryIssueImported.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: expect.objectContaining({ state: "failed", attemptCount: 5 }),
    });
  });

  it("still files approved rows when listing Sentry fails, but reports the error", async () => {
    vi.mocked(sentry.listUnresolvedIssues).mockRejectedValue(new Error("Sentry 502"));
    vi.mocked(prisma.sentryIssueImported.findMany).mockResolvedValueOnce([row({ targetProject: "EPM" })]);
    vi.mocked(jira.createIssue).mockResolvedValue({ id: "1", key: "EPM-1", self: "" });

    const result = await runSentryImport();

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["discover: Sentry 502"]);
    expect(result.stats).toEqual({ discovered: 0, imported: 1, recovered: 0, failed: 0 });
  });
});

type Row = Awaited<ReturnType<typeof prisma.sentryIssueImported.findMany>>[number];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "rec-1",
    sentryProject: "mobile-app",
    sentryIssueId: "500",
    jiraKey: null,
    state: "approved",
    attemptCount: 0,
    lastError: null,
    lastAttemptAt: null,
    importedAt: null,
    shortId: null,
    title: null,
    level: null,
    permalinkUrl: null,
    eventCount: null,
    firstSeen: null,
    lastSeen: null,
    targetProject: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
