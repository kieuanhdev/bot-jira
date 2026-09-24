import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPollPrComments } from "./poll-pr-comments";
import { prisma } from "@/lib/prisma";
import { bitbucket, type BbPullRequest, type BbPrActivity } from "@/lib/bitbucket/client";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import * as guardModule from "../guard";
import type { IntegrationCursor } from "@prisma/client";

const cursorRow = (cursor: string) =>
  ({
    id: "cur-1",
    integration: "bitbucket",
    scope: "pr-comments:EPM/easy_pos",
    cursor,
    lastStartedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    stats: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) satisfies IntegrationCursor;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    repos: vi.fn(),
    listOpenPullRequests: vi.fn(),
    listPullRequestActivities: vi.fn(),
  },
}));

vi.mock("@/lib/bitbucket/notify-pr-comment", () => ({
  notifyPrComment: vi.fn().mockResolvedValue({ notifiedCount: 1, targetUserIds: ["user-1"] }),
}));

describe("runPollPrComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guardModule, "hasBitbucketConfig").mockReturnValue(true);
  });

  it("skips notifications on initial run and sets baseline cursor", async () => {
    vi.mocked(bitbucket.repos).mockReturnValue(["EPM/easy_pos"]);
    vi.mocked(prisma.integrationCursor.findUnique).mockResolvedValue(null);
    vi.mocked(bitbucket.listOpenPullRequests).mockResolvedValue([
      { id: 10, title: "Test PR", fromRef: { branch: "feat/1" } } satisfies BbPullRequest,
    ]);
    vi.mocked(bitbucket.listPullRequestActivities).mockResolvedValue([
      {
        id: 100,
        action: "COMMENTED",
        comment: {
          id: 501,
          text: "Old existing comment",
          createdDate: 10000,
          author: { name: "someone" },
        },
      } satisfies BbPrActivity,
    ]);

    const result = await runPollPrComments();

    expect(result.ok).toBe(true);
    expect(notifyPrComment).not.toHaveBeenCalled(); // No notifications on initial run
    expect(prisma.integrationCursor.upsert).toHaveBeenCalledWith({
      where: { integration_scope: { integration: "bitbucket", scope: "pr-comments:EPM/easy_pos" } },
      create: expect.objectContaining({ cursor: "10000" }),
      update: expect.objectContaining({ cursor: "10000" }),
    });
  });

  it("notifies for comments newer than the existing cursor", async () => {
    vi.mocked(bitbucket.repos).mockReturnValue(["EPM/easy_pos"]);
    vi.mocked(prisma.integrationCursor.findUnique).mockResolvedValue(cursorRow("10000"));
    vi.mocked(bitbucket.listOpenPullRequests).mockResolvedValue([
      { id: 10, title: "Test PR", fromRef: { branch: "feat/1" } } satisfies BbPullRequest,
    ]);
    vi.mocked(bitbucket.listPullRequestActivities).mockResolvedValue([
      {
        id: 100,
        action: "COMMENTED",
        comment: {
          id: 501,
          text: "Old comment",
          createdDate: 9000,
          author: { name: "someone" },
        },
      } satisfies BbPrActivity,
      {
        id: 101,
        action: "COMMENTED",
        comment: {
          id: 502,
          text: "Brand new comment",
          createdDate: 12000,
          author: { name: "someone_else" },
        },
      } satisfies BbPrActivity,
    ]);

    const result = await runPollPrComments();

    expect(result.ok).toBe(true);
    expect(notifyPrComment).toHaveBeenCalledTimes(1);
    expect(notifyPrComment).toHaveBeenCalledWith({
      repo: "EPM/easy_pos",
      pr: expect.objectContaining({ id: 10 }),
      comment: expect.objectContaining({ id: 502, text: "Brand new comment" }),
    });

    expect(prisma.integrationCursor.upsert).toHaveBeenCalledWith({
      where: { integration_scope: { integration: "bitbucket", scope: "pr-comments:EPM/easy_pos" } },
      create: expect.objectContaining({ cursor: "12000" }),
      update: expect.objectContaining({ cursor: "12000" }),
    });
  });
});
