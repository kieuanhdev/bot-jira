/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPollPrComments, isPrCandidate } from "./poll-pr-comments";
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
    activeRunToken: null,
    activeRunStartedAt: null,
    activeRunExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) satisfies IntegrationCursor;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    repos: vi.fn(),
    allRepos: vi.fn(),
    listPullRequests: vi.fn(),
    listOpenPullRequests: vi.fn(),
    listPullRequestActivities: vi.fn(),
  },
  getSystemBitbucketCreds: vi.fn().mockResolvedValue({ user: "sys-user", token: "sys-token" }),
  isBitbucketPermissionError: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/bitbucket/notify-pr-comment", () => ({
  notifyPrComment: vi.fn().mockResolvedValue({ notifiedCount: 1, targetUserIds: ["user-1"] }),
}));

describe("isPrCandidate", () => {
  it("always includes OPEN pull requests", () => {
    const pr = { id: 1, state: "OPEN" } as BbPullRequest;
    expect(isPrCandidate(pr, new Set(["user1"]))).toBe(true);
  });

  it("includes MERGED PRs if author matches registered user tokens", () => {
    const pr = {
      id: 2,
      state: "MERGED",
      author: { user: { name: "anhnk_mb" } },
      updatedDate: Date.now() - 1000 * 3600,
    } as unknown as BbPullRequest;
    expect(isPrCandidate(pr, new Set(["anhnk_mb"]))).toBe(true);
  });

  it("excludes MERGED PRs if no matching user tokens", () => {
    const pr = {
      id: 3,
      state: "MERGED",
      author: { user: { name: "other_user" } },
      updatedDate: Date.now() - 1000 * 3600,
    } as unknown as BbPullRequest;
    expect(isPrCandidate(pr, new Set(["anhnk_mb"]))).toBe(false);
  });

  it("excludes ancient MERGED PRs older than 180 days", () => {
    const pr = {
      id: 4,
      state: "MERGED",
      author: { user: { name: "anhnk_mb" } },
      updatedDate: Date.now() - 200 * 24 * 3600 * 1000,
    } as unknown as BbPullRequest;
    expect(isPrCandidate(pr, new Set(["anhnk_mb"]))).toBe(false);
  });

  it("includes MERGED PRs if branch name contains a registered Jira key", () => {
    const pr = {
      id: 5,
      state: "MERGED",
      author: { user: { name: "someone_else" } },
      fromRef: { branch: "feature/EPM-999-fix" },
      updatedDate: Date.now() - 1000 * 3600,
    } as unknown as BbPullRequest;
    expect(isPrCandidate(pr, new Set(), new Set(["EPM-999"]))).toBe(true);
  });

  it("includes MERGED PRs if PR title contains a registered Jira key", () => {
    const pr = {
      id: 6,
      state: "DECLINED",
      author: { user: { name: "someone_else" } },
      title: "Fix bug EPM-888 in checkout",
      updatedDate: Date.now() - 1000 * 3600,
    } as unknown as BbPullRequest;
    expect(isPrCandidate(pr, new Set(), new Set(["EPM-888"]))).toBe(true);
  });
});

describe("runPollPrComments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(guardModule, "hasBitbucketConfig").mockReturnValue(true);
  });

  it("skips notifications on initial run and sets baseline cursor", async () => {
    vi.mocked(bitbucket.allRepos).mockResolvedValue(["EPM/easy_pos"]);
    vi.mocked(prisma.integrationCursor.findUnique).mockResolvedValue(null);
    const mockPr = { id: 10, title: "Test PR", state: "OPEN", fromRef: { branch: "feat/1" } } satisfies BbPullRequest;
    vi.mocked(bitbucket.listPullRequests).mockResolvedValue([mockPr]);
    vi.mocked(bitbucket.listOpenPullRequests).mockResolvedValue([mockPr]);
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

  it("notifies for comments newer than the existing cursor on OPEN and MERGED PRs", async () => {
    const now = Date.now();
    const cursorTime = now - 5000;
    vi.mocked(bitbucket.allRepos).mockResolvedValue(["EPM/easy_pos"]);
    vi.mocked(prisma.integrationCursor.findUnique).mockResolvedValue(cursorRow(String(cursorTime)));
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", jiraUsername: "anhnk_mb", email: "anhnk@intern.vn", bitbucketUserEnc: null },
    ] as unknown as Parameters<typeof prisma.user.findMany>[0] extends undefined ? never : any);

    const mergedPr = {
      id: 21,
      title: "fix EPM-3291",
      state: "MERGED",
      author: { user: { name: "anhnk_mb" } },
      updatedDate: now - 3600_000, // merged recently
      fromRef: { branch: "feat/payment" },
    } as unknown as BbPullRequest;

    vi.mocked(bitbucket.listPullRequests).mockResolvedValue([mergedPr]);
    vi.mocked(bitbucket.listOpenPullRequests).mockResolvedValue([mergedPr]);
    vi.mocked(bitbucket.listPullRequestActivities).mockResolvedValue([
      {
        id: 101,
        action: "COMMENTED",
        comment: {
          id: 352967,
          text: ".",
          createdDate: now - 1000,
          author: { name: "duclm" },
        },
      } satisfies BbPrActivity,
    ]);

    const result = await runPollPrComments();

    expect(result.ok).toBe(true);
    expect(notifyPrComment).toHaveBeenCalledTimes(1);
    expect(notifyPrComment).toHaveBeenCalledWith({
      repo: "EPM/easy_pos",
      pr: expect.objectContaining({ id: 21 }),
      comment: expect.objectContaining({ id: 352967, text: "." }),
    });

    expect(prisma.integrationCursor.upsert).toHaveBeenCalledWith({
      where: { integration_scope: { integration: "bitbucket", scope: "pr-comments:EPM/easy_pos" } },
      create: expect.objectContaining({ cursor: String(now - 1000) }),
      update: expect.objectContaining({ cursor: String(now - 1000) }),
    });
  });
});
