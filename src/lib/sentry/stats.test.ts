import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSentryStats } from "./stats";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sentryIssueImported: {
      findMany: vi.fn(),
      count: vi.fn(),
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
    sentryProjectMappings: "mobile:EPM,backend:CICM",
  },
  jiraProjectList: ["CICM"],
  parseSentryMappings: (raw: string) => {
    if (!raw) return [];
    return [
      { sentryProject: "mobile", jiraProject: "EPM" },
      { sentryProject: "backend", jiraProject: "CICM" },
    ];
  },
  resolveJiraProject: (
    sentryProject: string,
    mappings: Array<{ sentryProject: string; jiraProject: string }>,
    fallback: string | null
  ) => {
    const match = mappings.find((m) => m.sentryProject === sentryProject);
    return match ? match.jiraProject : fallback;
  },
}));

describe("src/lib/sentry/stats", () => {
  const fixedNow = new Date("2026-10-21T12:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin: fetches without project filter and computes stats", async () => {
    // 1. Pending items: 1 critical (hot), 1 noise, 1 normal
    prismaMock.sentryIssueImported.findMany
      .mockResolvedValueOnce([
        {
          level: "error",
          title: "Unhandled Exception in checkout",
          eventCount: 150,
          countBaseline: 50,
          countBaselineAt: fixedNow,
        }, // critical, hot
        { level: "info", title: "Some info telemetry", eventCount: 10, countBaseline: 10 }, // noise, not hot
        { level: "warning", title: "Slow response warning", eventCount: 5, countBaseline: 5 }, // normal, not hot
      ])
      // 2. 7 days items
      .mockResolvedValueOnce([
        { createdAt: new Date("2026-10-21T10:00:00.000Z") },
        { createdAt: new Date("2026-10-21T08:00:00.000Z") },
        { createdAt: new Date("2026-10-19T14:00:00.000Z") },
      ]);

    // new24h count
    prismaMock.sentryIssueImported.count.mockResolvedValueOnce(5);

    const stats = await getSentryStats({ all: true }, undefined, fixedNow);

    expect(stats.pendingReview).toBe(3);
    expect(stats.criticalPending).toBe(1);
    expect(stats.hotCount).toBe(1);
    expect(stats.noiseRatio).toBe(0.3333);
    expect(stats.new24h).toBe(5);

    // 7 days check
    expect(stats.byDay).toHaveLength(7);
    expect(stats.byDay[6]).toEqual({ date: "2026-10-21", count: 2 });
    expect(stats.byDay[5]).toEqual({ date: "2026-10-20", count: 0 }); // ngày trống trả 0
    expect(stats.byDay[4]).toEqual({ date: "2026-10-19", count: 1 });
    expect(stats.byDay[0]).toEqual({ date: "2026-10-15", count: 0 }); // ngày trống trả 0
  });

  it("scope non-admin: filters by allowed projects and excludes ignored issues", async () => {
    prismaMock.sentryIssueImported.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.count.mockResolvedValueOnce(0);

    await getSentryStats({ all: false, projects: ["EPM"] }, undefined, fixedNow);

    // Verify pending query includes non-ignored condition & project condition
    const pendingQueryCall = prismaMock.sentryIssueImported.findMany.mock.calls[0][0];
    expect(pendingQueryCall.where.AND).toContainEqual({ state: { not: "ignored" } });
    expect(pendingQueryCall.where.AND).toContainEqual({
      OR: [
        { targetProject: { in: ["EPM"] } },
        { targetProject: null, sentryProject: { in: ["mobile"] } },
      ],
    });
    expect(pendingQueryCall.where.AND).toContainEqual({
      state: { in: ["pending", "review"] },
    });

    // Verify 24h count includes non-ignored condition & project condition
    const countCall = prismaMock.sentryIssueImported.count.mock.calls[0][0];
    expect(countCall.where.AND).toContainEqual({ state: { not: "ignored" } });
  });

  it("ranh giới 24h: passes exact 24h cutoff to count query", async () => {
    prismaMock.sentryIssueImported.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.count.mockResolvedValueOnce(2);

    await getSentryStats({ all: true }, undefined, fixedNow);

    const countCall = prismaMock.sentryIssueImported.count.mock.calls[0][0];
    const expectedCutoff = new Date(fixedNow.getTime() - 24 * 60 * 60 * 1000);
    expect(countCall.where.AND).toContainEqual({
      createdAt: { gte: expectedCutoff },
    });
  });

  it("returns zero stats immediately if requested projectKey is not in user scope", async () => {
    const stats = await getSentryStats(
      { all: false, projects: ["EPM"] },
      "UNKNOWN_PROJ",
      fixedNow
    );

    expect(stats.pendingReview).toBe(0);
    expect(stats.criticalPending).toBe(0);
    expect(stats.new24h).toBe(0);
    expect(stats.noiseRatio).toBe(0);
    expect(stats.byDay).toHaveLength(7);
    expect(stats.byDay.every((d) => d.count === 0)).toBe(true);

    expect(prismaMock.sentryIssueImported.findMany).not.toHaveBeenCalled();
    expect(prismaMock.sentryIssueImported.count).not.toHaveBeenCalled();
  });

  it("handles empty pending queue gracefully with 0 noise ratio", async () => {
    prismaMock.sentryIssueImported.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.count.mockResolvedValueOnce(0);

    const stats = await getSentryStats({ all: true }, undefined, fixedNow);

    expect(stats.pendingReview).toBe(0);
    expect(stats.criticalPending).toBe(0);
    expect(stats.noiseRatio).toBe(0);
  });
});
