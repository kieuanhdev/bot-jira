import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyCommitComment } from "./notify-commit-comment";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { bitbucket } from "./client";
import type { User } from "@prisma/client";

const now = new Date();
const userRow = (id: string, jiraUsername: string, email: string) =>
  ({
    id,
    email,
    passwordHash: null,
    displayName: jiraUsername,
    jiraUsername,
    jiraIdentityKey: null,
    role: "member",
    pushSubscription: null,
    jiraUserEnc: null,
    jiraTokenEnc: null,
    jiraAuth: null,
    bitbucketUserEnc: null,
    bitbucketTokenEnc: null,
    jiraVerifiedAt: null,
    bitbucketVerifiedAt: null,
    boardProjects: [],
    onboarded: false,
    createdAt: now,
    updatedAt: now,
  }) satisfies User;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
    issueCache: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    watch: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/notify", () => ({
  notifyUser: vi.fn(),
}));

vi.mock("./client", () => ({
  bitbucket: {
    getCommit: vi.fn(),
  },
  getSystemBitbucketCreds: vi.fn().mockResolvedValue({ user: "sys", token: "tok" }),
}));

describe("notifyCommitComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies commit author when someone comments on their commit", async () => {
    vi.mocked(bitbucket.getCommit).mockResolvedValueOnce({
      id: "501630298ae1179c02241a5024966b789e5b4b73",
      message: "feat: implement web view page",
      author: { name: "anhnk_mb", emailAddress: "anhnk@intern.vn" },
    });

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      userRow("user-anhnk", "anhnk_mb", "anhnk@intern.vn"),
    ]);

    // Second call for bitbucketUserEnc fallback
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([]);

    // Third call for excluding comment author
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      userRow("user-anhnk", "anhnk_mb", "anhnk@intern.vn"),
    ]);

    vi.mocked(notifyUser).mockResolvedValue({ id: "notif-c1" } as unknown as Awaited<ReturnType<typeof notifyUser>>);

    const result = await notifyCommitComment({
      repo: "SMA/sds_feedback",
      commit: {
        id: "501630298ae1179c02241a5024966b789e5b4b73",
      },
      comment: {
        id: 358407,
        text: "navigate",
        author: { name: "ngocdv", displayName: "ngocdv", emailAddress: "ngocdv@intern.vn" },
        anchor: { path: "lib/src/web_view_page.dart", line: 84 },
      },
    });

    expect(notifyUser).toHaveBeenCalledTimes(1);
    expect(notifyUser).toHaveBeenCalledWith("user-anhnk", expect.objectContaining({
      type: "comment",
      title: expect.stringContaining("commit [501630298a]"),
      body: expect.stringContaining("ngocdv (lib/src/web_view_page.dart:84): navigate"),
      eventKey: "bb-commit-comment:SMA/sds_feedback:501630298ae1179c02241a5024966b789e5b4b73:358407",
    }));
    expect(result.notifiedCount).toBe(1);
    expect(result.targetUserIds).toEqual(["user-anhnk"]);
  });

  it("excludes comment author if they commented on their own commit", async () => {
    vi.mocked(bitbucket.getCommit).mockResolvedValueOnce({
      id: "abc1234567890",
      message: "self commit",
      author: { name: "anhnk_mb", emailAddress: "anhnk@intern.vn" },
    });

    const result = await notifyCommitComment({
      repo: "SMA/sds_feedback",
      commit: { id: "abc1234567890" },
      comment: {
        id: 999,
        text: "my own note",
        author: { name: "anhnk_mb", emailAddress: "anhnk@intern.vn" },
      },
    });

    expect(result.notifiedCount).toBe(0);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});
