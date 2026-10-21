import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSentryImports } from "./list";

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

describe("src/lib/sentry/list", () => {
  const testDate = new Date("2026-10-16T09:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin: fetches without project filter and aggregates counts including ignored", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([
      {
        id: "s1",
        sentryProject: "mobile",
        sentryIssueId: "1",
        shortId: "MOB-1",
        title: "Crash",
        level: "error",
        permalinkUrl: null,
        eventCount: 1,
        firstSeen: testDate,
        lastSeen: testDate,
        targetProject: "EPM",
        jiraKey: null,
        state: "pending",
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
      { state: "pending", _count: { _all: 2 } },
      { state: "ignored", _count: { _all: 5 } },
    ]);

    const result = await listSentryImports("review", { all: true });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: { state: { in: ["review", "pending"] } },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
    expect(prismaMock.sentryIssueImported.groupBy).toHaveBeenCalledWith({
      by: ["state"],
      where: undefined,
      _count: { _all: true },
    });
    expect(result.counts.review).toBe(2);
    expect(result.counts.ignored).toBe(5);
    expect(result.items[0].targetProject).toBe("EPM");
  });

  it("regular user: filters by scope projects and hides ignored state", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([
      {
        id: "s2",
        sentryProject: "mobile",
        sentryIssueId: "2",
        shortId: "MOB-2",
        title: "Bug",
        level: "error",
        permalinkUrl: null,
        eventCount: 1,
        firstSeen: testDate,
        lastSeen: testDate,
        targetProject: null, // should resolve to EPM
        jiraKey: null,
        state: "review",
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
      { state: "review", _count: { _all: 1 } },
      { state: "ignored", _count: { _all: 9 } }, // should be ignored for regular user
    ]);

    const result = await listSentryImports("review,ignored", {
      all: false,
      projects: ["EPM"],
    });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { state: { in: ["review", "pending"] } }, // ignored was stripped
          {
            OR: [
              { targetProject: { in: ["EPM"] } },
              { targetProject: null, sentryProject: { in: ["mobile"] } },
            ],
          },
        ],
      },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
    expect(result.counts.review).toBe(1);
    expect(result.counts.ignored).toBeUndefined();
    expect(result.items[0].targetProject).toBe("EPM");
  });

  it("regular user without a state filter still excludes ignored rows", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports(undefined, { all: false, projects: ["EPM"] });

    const where = prismaMock.sentryIssueImported.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ state: { not: "ignored" } });
  });

  it("returns empty result if requested projectKey is not in user scope", async () => {
    const result = await listSentryImports("review", { all: false, projects: ["EPM"] }, "MHRM");

    expect(result.items).toEqual([]);
    expect(result.counts).toEqual({});
    expect(prismaMock.sentryIssueImported.findMany).not.toHaveBeenCalled();
  });

  it("filters by single projectKey when allowed", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports("review", { all: false, projects: ["EPM", "CICM"] }, "CICM");

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { state: { in: ["review", "pending"] } },
          {
            OR: [
              { targetProject: { in: ["CICM"] } },
              { targetProject: null, sentryProject: { in: ["backend"] } },
            ],
          },
        ],
      },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
  });

  it("applies q search condition matching title or shortId and increases take to 500", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports("review", { all: true }, undefined, { q: "NetworkError" });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { state: { in: ["review", "pending"] } },
          {
            OR: [
              { title: { contains: "NetworkError", mode: "insensitive" } },
              { shortId: { contains: "NetworkError", mode: "insensitive" } },
            ],
          },
        ],
      },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
    });
  });

  it("preserves non-admin scope when searching with q", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports("review", { all: false, projects: ["EPM"] }, undefined, { q: "MOB-1" });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { state: { in: ["review", "pending"] } },
          {
            OR: [
              { targetProject: { in: ["EPM"] } },
              { targetProject: null, sentryProject: { in: ["mobile"] } },
            ],
          },
          {
            OR: [
              { title: { contains: "MOB-1", mode: "insensitive" } },
              { shortId: { contains: "MOB-1", mode: "insensitive" } },
            ],
          },
        ],
      },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 500,
    });
  });

  it("supports sort: 'events'", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports("review", { all: true }, undefined, { sort: "events" });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: { state: { in: ["review", "pending"] } },
      orderBy: [{ eventCount: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  });

  it("supports sort: 'first'", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports("review", { all: true }, undefined, { sort: "first" });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: { state: { in: ["review", "pending"] } },
      orderBy: [{ firstSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
  });

  it("supports sort: 'recent' as default", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    await listSentryImports("review", { all: true }, undefined, { sort: "recent" });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: { state: { in: ["review", "pending"] } },
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    });
  });

  it("calculates countDelta24h and isHot for each item", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([
      {
        id: "hot-1",
        sentryProject: "mobile",
        sentryIssueId: "10",
        eventCount: 150,
        countBaseline: 50,
        countBaselineAt: testDate,
        state: "pending",
        createdAt: testDate,
      },
      {
        id: "normal-1",
        sentryProject: "mobile",
        sentryIssueId: "11",
        eventCount: 30,
        countBaseline: 25,
        countBaselineAt: testDate,
        state: "pending",
        createdAt: testDate,
      },
    ]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    const result = await listSentryImports("review", { all: true });

    expect(result.items[0]).toMatchObject({
      id: "hot-1",
      countDelta24h: 100,
      isHot: true,
    });
    expect(result.items[1]).toMatchObject({
      id: "normal-1",
      countDelta24h: 5,
      isHot: false,
    });
  });

  it("supports sort: 'hot' and sorts items in memory by isHot then delta desc", async () => {
    prismaMock.sentryIssueImported.findMany.mockResolvedValueOnce([
      {
        id: "item-normal",
        eventCount: 30,
        countBaseline: 25,
        sentryProject: "mobile",
        sentryIssueId: "1",
        state: "pending",
        createdAt: testDate,
      },
      {
        id: "item-hot-smaller",
        eventCount: 100,
        countBaseline: 50,
        sentryProject: "mobile",
        sentryIssueId: "2",
        state: "pending",
        createdAt: testDate,
      },
      {
        id: "item-hot-bigger",
        eventCount: 200,
        countBaseline: 50,
        sentryProject: "mobile",
        sentryIssueId: "3",
        state: "pending",
        createdAt: testDate,
      },
    ]);
    prismaMock.sentryIssueImported.groupBy.mockResolvedValueOnce([]);

    const result = await listSentryImports("review", { all: true }, undefined, { sort: "hot" });

    expect(prismaMock.sentryIssueImported.findMany).toHaveBeenCalledWith({
      where: { state: { in: ["review", "pending"] } },
      orderBy: [{ eventCount: "desc" }, { lastSeen: { sort: "desc", nulls: "last" } }],
      take: 500,
    });

    expect(result.items.map((i: { id: string }) => i.id)).toEqual([
      "item-hot-bigger", // hot, delta=150
      "item-hot-smaller", // hot, delta=50
      "item-normal", // not hot, delta=5
    ]);
  });
});
