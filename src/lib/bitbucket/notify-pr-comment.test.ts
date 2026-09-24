import { describe, it, expect, vi, beforeEach } from "vitest";
import { isSameUser, notifyPrComment } from "./notify-pr-comment";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { deliverToChat } from "@/lib/notify/chat-delivery";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notify", () => ({
  notifyUser: vi.fn(),
}));

vi.mock("@/lib/notify/chat-delivery", () => ({
  deliverToChat: vi.fn().mockResolvedValue({ delivered: true }),
}));

describe("notifyPrComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isSameUser", () => {
    it("matches identical usernames", () => {
      expect(isSameUser({ name: "john" }, { name: "john" })).toBe(true);
    });

    it("matches _mb username suffixes", () => {
      expect(isSameUser({ name: "anhnk_mb" }, { name: "anhnk" })).toBe(true);
      expect(isSameUser({ name: "anhnk" }, { name: "anhnk_mb" })).toBe(true);
    });

    it("matches identical emails", () => {
      expect(
        isSameUser(
          { name: "u1", emailAddress: "test@example.com" },
          { name: "u2", emailAddress: "TEST@example.com" }
        )
      ).toBe(true);
    });

    it("returns false for different users", () => {
      expect(
        isSameUser(
          { name: "alice", emailAddress: "alice@example.com" },
          { name: "bob", emailAddress: "bob@example.com" }
        )
      ).toBe(false);
    });
  });

  describe("notifyPrComment dispatch", () => {
    it("notifies PR author and reviewer, but excludes comment author", async () => {
      const mockFindMany = vi.mocked(prisma.user.findMany);
      // First call for matching users by username/email
      mockFindMany.mockResolvedValueOnce([
        { id: "user-author", jiraUsername: "author_jira", email: "author@team.com" },
        { id: "user-reviewer", jiraUsername: "reviewer_jira", email: "reviewer@team.com" },
      ] as any);
      // Second call for bitbucketUserEnc fallback
      mockFindMany.mockResolvedValueOnce([]);

      vi.mocked(notifyUser).mockResolvedValue({ id: "notif-1" } as any);

      const result = await notifyPrComment({
        repo: "EPM/easy_pos",
        pr: {
          id: 42,
          title: "Fix invoice calculation",
          url: "https://git.local/epm/easy_pos/pull-requests/42",
          author: {
            user: { name: "author_jira", displayName: "Author Guy", emailAddress: "author@team.com" },
          },
          reviewers: [
            {
              user: { name: "reviewer_jira", displayName: "Reviewer Guy", emailAddress: "reviewer@team.com" },
            },
          ],
        },
        comment: {
          id: 101,
          text: "Looks good to me, please check line 40.",
          author: { name: "reviewer_jira", displayName: "Reviewer Guy", emailAddress: "reviewer@team.com" },
        },
      });

      // Reviewer was the comment author, so only Author Guy should be notified!
      expect(mockFindMany).toHaveBeenCalled();
      expect(notifyUser).toHaveBeenCalledTimes(1);
      expect(notifyUser).toHaveBeenCalledWith("user-author", {
        type: "comment",
        title: "Bình luận mới trên PR #42: Fix invoice calculation",
        body: "Reviewer Guy: Looks good to me, please check line 40.",
        link: "https://git.local/epm/easy_pos/pull-requests/42",
        severity: "info",
        eventKey: "bb-pr-comment:EPM/easy_pos:42:101",
      });

      expect(deliverToChat).toHaveBeenCalledTimes(1);
      expect(result.notifiedCount).toBe(1);
      expect(result.targetUserIds).toEqual(["user-author"]);
    });

    it("returns 0 if comment author is the only participant", async () => {
      const result = await notifyPrComment({
        repo: "EPM/easy_pos",
        pr: {
          id: 42,
          title: "Self comment PR",
          author: {
            user: { name: "me_jira" },
          },
        },
        comment: {
          id: 102,
          text: "I am adding self notes",
          author: { name: "me_jira" },
        },
      });

      expect(result.notifiedCount).toBe(0);
      expect(notifyUser).not.toHaveBeenCalled();
      expect(deliverToChat).not.toHaveBeenCalled();
    });
  });
});
