import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleBitbucketWebhook } from "./bitbucket";

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      branchInfoUpsert: vi.fn(),
      notifyUnauthorizedMerge: vi.fn(),
      notifyPrComment: vi.fn(),
      listPullRequestActivities: vi.fn(),
      getSystemBitbucketCreds: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    branchInfo: {
      upsert: (...args: unknown[]) => mocks.branchInfoUpsert(...args),
    },
  },
}));

vi.mock("@/lib/bitbucket/notify-pr-merged", () => ({
  notifyUnauthorizedMerge: (...args: unknown[]) =>
    mocks.notifyUnauthorizedMerge(...args),
}));

vi.mock("@/lib/bitbucket/notify-pr-comment", () => ({
  notifyPrComment: (...args: unknown[]) => mocks.notifyPrComment(...args),
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: {
    listPullRequestActivities: (...args: unknown[]) =>
      mocks.listPullRequestActivities(...args),
  },
  getSystemBitbucketCreds: () => mocks.getSystemBitbucketCreds(),
}));

describe("handleBitbucketWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when repository is missing", async () => {
    const result = await handleBitbucketWebhook({});
    expect(result).toEqual({ skipped: true, reason: "no repository" });
  });

  it("handles PR comment and skips merge alert", async () => {
    mocks.notifyPrComment.mockResolvedValueOnce({ notifiedCount: 1 });

    const payload = {
      eventKey: "pr:comment:added",
      repository: { slug: "my-repo", project: { key: "PRJ" } },
      pullRequest: {
        id: 12,
        title: "PR Title",
        fromRef: { branch: "feat/1" },
        author: { user: { name: "alice" } },
        reviewers: [],
      },
      comment: {
        id: 101,
        text: "Looks good!",
        author: { name: "bob" },
      },
    };

    const result = await handleBitbucketWebhook(payload);
    expect(result.commentId).toBe(101);
    expect(result.notifiedCount).toBe(1);
    expect(mocks.notifyUnauthorizedMerge).not.toHaveBeenCalled();
  });

  it("handles pr:merged with actor in payload", async () => {
    mocks.notifyUnauthorizedMerge.mockResolvedValueOnce({
      notifiedCount: 2,
      targetUserIds: ["lead-1", "lead-2"],
      skipped: false,
    });
    mocks.branchInfoUpsert.mockResolvedValueOnce({});

    const payload = {
      eventKey: "pr:merged",
      actor: {
        name: "dev1",
        displayName: "Developer One",
      },
      repository: { slug: "backend", project: { key: "EPM" } },
      pullRequest: {
        id: 42,
        title: "Fix crash",
        state: "MERGED",
        fromRef: { branch: "fix/EPM-1" },
        toRef: { branch: "master" },
      },
    };

    const result = await handleBitbucketWebhook(payload);

    expect(mocks.notifyUnauthorizedMerge).toHaveBeenCalledWith({
      repo: "EPM/backend",
      pr: {
        id: 42,
        title: "Fix crash",
        url: undefined,
        fromBranch: "fix/EPM-1",
        toBranch: "master",
      },
      actor: {
        name: "dev1",
        displayName: "Developer One",
      },
    });

    expect(result.mergeAlert).toEqual({
      notifiedCount: 2,
      targetUserIds: ["lead-1", "lead-2"],
      skipped: false,
    });

    expect(mocks.branchInfoUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { repo_branch: { repo: "EPM/backend", branch: "fix/EPM-1" } },
        create: expect.objectContaining({
          merged: true,
          prState: "MERGED",
        }),
      })
    );
  });

  it("handles pr:merged when actor is missing by falling back to PR activities", async () => {
    mocks.getSystemBitbucketCreds.mockResolvedValueOnce({ user: "bot", token: "tok" });
    mocks.listPullRequestActivities.mockResolvedValueOnce([
      { id: 1, action: "COMMENTED" },
      {
        id: 2,
        action: "MERGED",
        user: { name: "fallback_user", displayName: "Fallback Actor" },
      },
    ]);
    mocks.notifyUnauthorizedMerge.mockResolvedValueOnce({
      notifiedCount: 1,
      targetUserIds: ["lead-1"],
      skipped: false,
    });
    mocks.branchInfoUpsert.mockResolvedValueOnce({});

    const payload = {
      eventKey: "pr:merged",
      repository: { slug: "backend", project: { key: "EPM" } },
      pullRequest: {
        id: 42,
        title: "Fix crash",
        state: "MERGED",
        fromRef: { branch: "fix/EPM-1" },
        toRef: { branch: "master" },
      },
    };

    const result = await handleBitbucketWebhook(payload);

    expect(mocks.listPullRequestActivities).toHaveBeenCalledWith(
      "EPM/backend",
      42,
      { user: "bot", token: "tok" }
    );
    expect(mocks.notifyUnauthorizedMerge).toHaveBeenCalledWith({
      repo: "EPM/backend",
      pr: {
        id: 42,
        title: "Fix crash",
        url: undefined,
        fromBranch: "fix/EPM-1",
        toBranch: "master",
      },
      actor: {
        name: "fallback_user",
        displayName: "Fallback Actor",
      },
    });
    expect(result.mergeAlert).toBeDefined();
  });
});
