import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { seedSentryIssue, sentrySnapshot } from "./review-queue";

vi.mock("@/lib/prisma", () => ({
  prisma: { sentryIssueImported: { upsert: vi.fn() } },
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

  it("puts a new mapped issue in review and never overwrites the decision", async () => {
    await seedSentryIssue({
      id: 42,
      shortId: "APP-42",
      title: "Boom",
      level: "FATAL",
      count: "17",
      lastSeen: "2026-10-14T01:00:00Z",
      project: { slug: "mobile-app" },
    });

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.where).toEqual(key("mobile-app", "42"));
    expect(call.create).toMatchObject({
      state: "review",
      targetProject: "EPM",
      shortId: "APP-42",
      level: "fatal",
      eventCount: 17,
      lastSeen: new Date("2026-10-14T01:00:00Z"),
    });
    expect(call.update).not.toHaveProperty("state");
    expect(call.update).toMatchObject({ title: "Boom", eventCount: 17 });
  });

  it("approves straight away when approval is turned off", async () => {
    env.sentryImportRequireApproval = false;
    await seedSentryIssue({ id: 1, project: { slug: "mobile-app" } });

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.create).toMatchObject({ state: "approved", targetProject: "EPM" });
  });

  it("marks an unmapped Sentry project ignored", async () => {
    await seedSentryIssue({ id: 7, project: { slug: "other-app" } });

    const call = vi.mocked(prisma.sentryIssueImported.upsert).mock.calls[0][0];
    expect(call.create).toMatchObject({ state: "ignored", targetProject: null });
    expect(call.create.lastError).toContain("other-app");
  });

  it("drops unparseable snapshot fields instead of clearing stored values", () => {
    expect(sentrySnapshot({ count: "n/a", firstSeen: "not a date" })).toEqual({});
  });
});
