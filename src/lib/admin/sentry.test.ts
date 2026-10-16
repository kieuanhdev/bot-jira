import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSentryImports } from "./sentry";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sentryIssueImported: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    sentryImportRequireApproval: true,
    jiraBaseUrl: "https://jira.example.com",
  },
}));

describe("src/lib/admin/sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches sentry imports and aggregates counts, converting dates to ISO strings", async () => {
    const testDate = new Date("2026-10-16T09:00:00.000Z");
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([
      {
        id: "sentry-row-1",
        sentryProject: "web",
        sentryIssueId: "123",
        shortId: "WEB-123",
        title: "TypeError: null is not an object",
        level: "error",
        permalinkUrl: "https://sentry.io/issues/123",
        eventCount: 42,
        firstSeen: testDate,
        lastSeen: testDate,
        targetProject: "PROJ",
        jiraKey: "PROJ-10",
        state: "pending", // legacy pending maps to review
        attemptCount: 0,
        lastError: null,
        lastAttemptAt: null,
        importedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: testDate,
      },
    ]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([
      { state: "pending", _count: { _all: 3 } },
      { state: "approved", _count: { _all: 1 } },
    ]);

    const result = await listSentryImports("review");

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: { state: { in: ["review", "pending"] } },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });

    expect(result.counts.review).toBe(3);
    expect(result.counts.approved).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].state).toBe("review");
    expect(result.items[0].jiraUrl).toBe("https://jira.example.com/browse/PROJ-10");
    expect(result.items[0].createdAt).toBe("2026-10-16T09:00:00.000Z");
  });
});
