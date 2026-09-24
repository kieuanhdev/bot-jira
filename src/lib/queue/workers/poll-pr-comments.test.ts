import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPollPrComments } from "./poll-pr-comments";
import { prisma } from "@/lib/prisma";
import { bitbucket } from "@/lib/bitbucket/client";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import * as guardModule from "../guard";

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
      { id: 10, title: "Test PR", fromRef: { branch: "feat/1" } } as any,
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
      } as any,
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
    vi.mocked(prisma.integrationCursor.findUnique).mockResolvedValue({
      id: "cur-1",
      cursor: "10000",
    } as any);
    vi.mocked(bitbucket.listOpenPullRequests).mockResolvedValue([
      { id: 10, title: "Test PR", fromRef: { branch: "feat/1" } } as any,
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
      } as any,
      {
        id: 101,
        action: "COMMENTED",
        comment: {
          id: 502,
          text: "Brand new comment",
          createdDate: 12000,
          author: { name: "someone_else" },
        },
      } as any,
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
