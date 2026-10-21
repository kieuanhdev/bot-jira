import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { seedSentryIssue, sentrySnapshot } from "./review-queue";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sentryIssueImported: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      sentryProject: "mobile-app",
      sentryProjectMappings: "mobile-app:EPM",
      sentryImportRequireApproval: true,
    },
    jiraProjectList: ["EPM"],
  };
});

const key = (sentryProject: string, sentryIssueId: string) => ({
  sentryProject_sentryIssueId: { sentryProject, sentryIssueId },
});

describe("sentry review queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.sentryImportRequireApproval = true;
  });

  it("puts a new mapped issue in review and initializes baseline to 0 at now", async () => {
    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValueOnce(null);
    const testNow = new Date("2026-10-21T10:00:00.000Z");

    await seedSentryIssue(
      {
        id: 42,
        shortId: "APP-42",
        title: "Boom",
        level: "FATAL",
        count: "17",
        lastSeen: "2026-10-14T01:00:00Z",
        project: { slug: "mobile-app" },
      },
      undefined,
      testNow
    );

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.where).toEqual(key("mobile-app", "42"));
    expect(call.create).toMatchObject({
      state: "review",
      targetProject: "EPM",
      shortId: "APP-42",
      level: "fatal",
      eventCount: 17,
      countBaseline: 0,
      countBaselineAt: testNow,
      lastSeen: new Date("2026-10-14T01:00:00Z"),
    });
    expect(call.update).not.toHaveProperty("state");
    expect(call.update).toMatchObject({ title: "Boom", eventCount: 17, countBaseline: 0, countBaselineAt: testNow });
  });

  it("approves straight away when approval is turned off", async () => {
    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValueOnce(null);
    env.sentryImportRequireApproval = false;
    await seedSentryIssue({ id: 1, project: { slug: "mobile-app" } });

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.create).toMatchObject({ state: "approved", targetProject: "EPM" });
  });

  it("marks an unmapped Sentry project ignored", async () => {
    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValueOnce(null);
    await seedSentryIssue({ id: 7, project: { slug: "other-app" } });

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.create).toMatchObject({ state: "ignored", targetProject: null });
    expect(call.create.lastError).toContain("other-app");
  });

  it("drops unparseable snapshot fields instead of clearing stored values", () => {
    expect(sentrySnapshot({ count: "n/a", firstSeen: "not a date" })).toEqual({});
  });

  it("rotates baseline when existing row has countBaselineAt older than 24h", async () => {
    const existingBaselineAt = new Date("2026-10-20T08:00:00.000Z");
    const currentNow = new Date("2026-10-21T09:00:00.000Z"); // 25 hours later

    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValueOnce({
      eventCount: 100,
      countBaseline: 30,
      countBaselineAt: existingBaselineAt,
    } as unknown as Awaited<ReturnType<typeof prisma.sentryIssueImported.findUnique>>);

    await seedSentryIssue(
      {
        id: 42,
        count: "155",
        project: { slug: "mobile-app" },
      },
      undefined,
      currentNow
    );

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.update).toMatchObject({
      eventCount: 155,
      countBaseline: 100, // rotated to previous eventCount
      countBaselineAt: currentNow,
    });
  });

  it("does not overwrite baseline on consecutive polls within 24h", async () => {
    const existingBaselineAt = new Date("2026-10-21T08:00:00.000Z");
    const currentNow = new Date("2026-10-21T08:05:00.000Z"); // 5 minutes later

    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValueOnce({
      eventCount: 100,
      countBaseline: 40,
      countBaselineAt: existingBaselineAt,
    } as unknown as Awaited<ReturnType<typeof prisma.sentryIssueImported.findUnique>>);

    await seedSentryIssue(
      {
        id: 42,
        count: "105",
        project: { slug: "mobile-app" },
      },
      undefined,
      currentNow
    );

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.update).toMatchObject({
      eventCount: 105,
    });
    // countBaseline and countBaselineAt must not be touched
    expect(call.update).not.toHaveProperty("countBaseline");
    expect(call.update).not.toHaveProperty("countBaselineAt");
  });

  it("initializes baseline for legacy rows with countBaselineAt = null", async () => {
    const currentNow = new Date("2026-10-21T08:00:00.000Z");

    vi.mocked(prisma.sentryIssueImported.findUnique).mockResolvedValueOnce({
      eventCount: 200,
      countBaseline: null,
      countBaselineAt: null,
    } as unknown as Awaited<ReturnType<typeof prisma.sentryIssueImported.findUnique>>);

    await seedSentryIssue(
      {
        id: 42,
        count: "205",
        project: { slug: "mobile-app" },
      },
      undefined,
      currentNow
    );

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.update).toMatchObject({
      eventCount: 205,
      countBaseline: 200, // baseline initialized to current stored eventCount
      countBaselineAt: currentNow,
    });
  });
});
