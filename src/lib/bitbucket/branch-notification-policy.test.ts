import { describe, it, expect, beforeAll } from "vitest";
import {
  norm,
  isSameUser,
  userMatchesCandidates,
  isUserAuthor,
  formatPrCommentNotification,
  formatCommitCommentNotification,
  formatUnauthorizedMergeNotification,
  prCommentCandidates,
} from "./branch-notification-policy";
import { encrypt } from "@/lib/crypto";

beforeAll(() => {
  process.env.CRED_ENCRYPTION_KEY = "0".repeat(64);
});

describe("branch-notification-policy", () => {
  describe("norm", () => {
    it("trims and lowercases input strings", () => {
      expect(norm("  User@Example.COM  ")).toBe("user@example.com");
      expect(norm(null)).toBe("");
      expect(norm(undefined)).toBe("");
    });
  });

  describe("isSameUser", () => {
    it("matches users with exact names", () => {
      expect(isSameUser({ name: "alice" }, { name: "alice" })).toBe(true);
    });

    it("matches users through Jira/Bitbucket username aliases", () => {
      expect(isSameUser({ name: "anhnk_mb" }, { name: "anhnk" })).toBe(true);
      expect(isSameUser({ name: "anhnk" }, { name: "anhnk_mb" })).toBe(true);
    });

    it("matches users with identical emails case-insensitively", () => {
      expect(
        isSameUser(
          { name: "u1", emailAddress: "dev@company.com" },
          { name: "u2", emailAddress: "DEV@company.com" }
        )
      ).toBe(true);
    });

    it("returns false when neither names nor emails match", () => {
      expect(
        isSameUser(
          { name: "alice", emailAddress: "alice@company.com" },
          { name: "bob", emailAddress: "bob@company.com" }
        )
      ).toBe(false);
    });
  });

  describe("userMatchesCandidates", () => {
    it("matches when candidate name aliases include user jiraUsername", () => {
      const candidates = [{ name: "anhnk_mb" }];
      expect(userMatchesCandidates({ jiraUsername: "anhnk" }, candidates)).toBe(true);
    });

    it("matches when candidate email equals user email", () => {
      const candidates = [{ name: "other", emailAddress: "alice@company.com" }];
      expect(userMatchesCandidates({ email: "ALICE@company.com" }, candidates)).toBe(true);
    });

    it("returns false if candidate does not match", () => {
      const candidates = [{ name: "charlie", emailAddress: "charlie@company.com" }];
      expect(
        userMatchesCandidates({ jiraUsername: "david", email: "david@company.com" }, candidates)
      ).toBe(false);
    });
  });

  describe("isUserAuthor", () => {
    it("identifies user matching comment author by jiraUsername alias", () => {
      const author = { name: "anhnk_mb" };
      expect(isUserAuthor({ jiraUsername: "anhnk" }, author)).toBe(true);
    });

    it("identifies user matching comment author by email", () => {
      const author = { name: "unknown", emailAddress: "author@company.com" };
      expect(isUserAuthor({ email: "AUTHOR@company.com" }, author)).toBe(true);
    });

    it("identifies user matching comment author by encrypted bitbucket username", () => {
      const author = { name: "ngocdv" };
      const enc = encrypt("ngocdv");
      expect(isUserAuthor({ bitbucketUserEnc: enc }, author)).toBe(true);
    });

    it("returns false when user is different from comment author", () => {
      const author = { name: "author_guy", emailAddress: "author@company.com" };
      expect(
        isUserAuthor({ jiraUsername: "reviewer_guy", email: "reviewer@company.com" }, author)
      ).toBe(false);
    });
  });

  describe("formatPrCommentNotification", () => {
    it("formats PR comment notification with PR title and author displayName", () => {
      const result = formatPrCommentNotification({
        repo: "PROJECT/repo_slug",
        pr: {
          id: 42,
          title: "Fix payment calculation bug",
          url: "https://bitbucket.corp/projects/PROJECT/repos/repo_slug/pull-requests/42",
        },
        comment: {
          id: 101,
          text: "Please double check tax rate",
          author: { name: "john_d", displayName: "John Doe" },
        },
      });

      expect(result).toEqual({
        type: "comment",
        title: "Bình luận mới trên PR #42: Fix payment calculation bug",
        body: "John Doe: Please double check tax rate",
        link: "/branches?view=all-branches&repo=PROJECT%2Frepo_slug",
        sourceLink: "https://bitbucket.corp/projects/PROJECT/repos/repo_slug/pull-requests/42",
        sourceType: "git",
        severity: "info",
        eventKey: "bb-pr-comment:PROJECT/repo_slug:42:101",
        chatDigestGroup: "bb-pr-comment:PROJECT/repo_slug:42",
      });
    });

    it("formats title with repo name when pr title is missing", () => {
      const result = formatPrCommentNotification({
        repo: "PROJECT/repo_slug",
        pr: {
          id: 42,
          branch: "feature/PROJ-123",
        },
        comment: {
          id: 102,
          text: "Looks good",
          author: { name: "john_d" },
        },
        baseUrl: "https://bitbucket.corp",
      });

      expect(result.title).toBe("Bình luận mới trên PR #42 (PROJECT/repo_slug)");
      expect(result.link).toBe("/branches?view=all-branches&q=feature%2FPROJ-123");
      expect(result.sourceLink).toBe("https://bitbucket.corp/projects/PROJECT/repos/repo_slug/pull-requests/42");
      expect(result.body).toBe("john_d: Looks good");
    });

    it("truncates comment text exceeding 200 characters in body", () => {
      const longComment = "A".repeat(300);
      const result = formatPrCommentNotification({
        repo: "PROJECT/repo_slug",
        pr: { id: 10 },
        comment: {
          id: 103,
          text: longComment,
          author: { name: "tester" },
        },
      });

      expect(result.body).toBe(`tester: ${"A".repeat(200)}`);
      expect(result.link).toBe("/branches?view=all-branches&repo=PROJECT%2Frepo_slug");
      expect(result.sourceLink).toBe("/branches?view=all-branches&repo=PROJECT%2Frepo_slug");
    });
  });

  describe("formatCommitCommentNotification", () => {
    it("formats commit comment with anchor, commit suffix, and bitbucket URL", () => {
      const result = formatCommitCommentNotification({
        repo: "PROJECT/repo_slug",
        commit: {
          id: "1234567890abcdef1234567890abcdef12345678",
          message: "feat: add invoice validation\n\nMore details...",
        },
        comment: {
          id: 555,
          text: "Consider using zod schema",
          author: { name: "alice_w", displayName: "Alice Wonder" },
          anchor: { path: "src/invoice.ts", line: 42 },
        },
        baseUrl: "https://bitbucket.corp/",
      });

      expect(result).toEqual({
        type: "comment",
        title: "Bình luận mới trên commit [1234567890]: feat: add invoice validation (PROJECT/repo_slug)",
        body: "Alice Wonder (src/invoice.ts:42): Consider using zod schema",
        link: "/branches?view=all-branches&repo=PROJECT%2Frepo_slug",
        sourceLink: "https://bitbucket.corp/projects/PROJECT/repos/repo_slug/commits/1234567890abcdef1234567890abcdef12345678#src%2Finvoice.ts",
        sourceType: "git",
        severity: "info",
        eventKey: "bb-commit-comment:PROJECT/repo_slug:1234567890abcdef1234567890abcdef12345678:555",
        chatDigestGroup: "bb-commit-comment:PROJECT/repo_slug:1234567890abcdef1234567890abcdef12345678",
      });
    });

    it("falls back to /branches when baseUrl or repo format is invalid", () => {
      const result = formatCommitCommentNotification({
        repo: "invalid-repo-format",
        commit: { id: "abcdef123456" },
        comment: {
          id: 666,
          text: "Quick fix",
          author: { name: "bob" },
        },
      });

      expect(result.link).toBe("/branches?view=all-branches&repo=invalid-repo-format");
      expect(result.sourceLink).toBe("/branches?view=all-branches&repo=invalid-repo-format");
      expect(result.title).toBe("Bình luận mới trên commit [abcdef1234] (invalid-repo-format)");
      expect(result.body).toBe("bob: Quick fix");
    });

    it("truncates commit first line beyond 80 characters and body text beyond 200 characters", () => {
      const longFirstLine = "feat: " + "X".repeat(120);
      const longComment = "Y".repeat(250);

      const result = formatCommitCommentNotification({
        repo: "PRJ/rep",
        commit: {
          id: "1234567890abcdef",
          message: longFirstLine,
        },
        comment: {
          id: 777,
          text: longComment,
          author: { name: "bob" },
          anchor: { path: "main.go" },
        },
      });

      expect(result.title).toBe(`Bình luận mới trên commit [1234567890]: ${longFirstLine.slice(0, 80)} (PRJ/rep)`);
      expect(result.body).toBe(`bob (main.go): ${"Y".repeat(200)}`);
    });
  });

  describe("formatUnauthorizedMergeNotification", () => {
    it("formats unauthorized merge notification with title, repo, actor displayName and branches", () => {
      const result = formatUnauthorizedMergeNotification({
        repo: "PRJ/my-repo",
        pr: {
          id: 42,
          title: "Fix authentication leak",
          fromBranch: "feature/EPM-123",
          toBranch: "master",
          url: "https://git.example.com/pr/42",
        },
        actor: {
          name: "dev1",
          displayName: "Dev One",
        },
        jiraKeys: ["EPM-123"],
      });

      expect(result.type).toBe("pr");
      expect(result.severity).toBe("warning");
      expect(result.title).toBe("PR #42 vừa được merge bởi Dev One (không phải leader) — PRJ/my-repo");
      expect(result.body).toBe("Fix authentication leak: feature/EPM-123 → master [EPM-123]");
      expect(result.link).toBe("/branches?view=all-branches&q=feature%2FEPM-123");
      expect(result.sourceLink).toBe("https://git.example.com/pr/42");
      expect(result.sourceType).toBe("git");
      expect(result.eventKey).toBe("bb-pr-merged-nonleader:PRJ/my-repo:42");
    });

    it("falls back to actor name and /branches?q= when title and url are missing", () => {
      const result = formatUnauthorizedMergeNotification({
        repo: "PRJ/backend",
        pr: {
          id: 99,
          fromBranch: "dev",
          toBranch: "main",
        },
        actor: {
          name: "stranger",
        },
      });

      expect(result.title).toBe("PR #99 vừa được merge bởi stranger (không phải leader) — PRJ/backend");
      expect(result.body).toBe("dev → main");
      expect(result.link).toBe("/branches?view=all-branches&q=dev");
      expect(result.sourceLink).toBe("/branches?view=all-branches&q=dev");
      expect(result.eventKey).toBe("bb-pr-merged-nonleader:PRJ/backend:99");
    });
  });
});

describe("prCommentCandidates", () => {
  const author = { name: "ngocdv" };
  const lead = { name: "vunt_mb" };
  const other = { name: "hungtq_mb" };
  const names = (users: Array<{ name: string }>) => users.map((u) => u.name);

  it("notifies everyone in the thread on a reply, not uninvolved reviewers", () => {
    expect(
      names(prCommentCandidates({
        prAuthor: author, reviewers: [lead, other], commentAuthor: author,
        thread: { isReply: true, participants: [lead, author] },
      }))
    ).toEqual(["ngocdv", "vunt_mb", "ngocdv"]);
  });

  it("notifies the PR author about a new comment from a reviewer", () => {
    expect(
      names(prCommentCandidates({
        prAuthor: author, reviewers: [lead, other], commentAuthor: lead, thread: { isReply: false },
      }))
    ).toEqual(["ngocdv"]);
  });

  it("notifies reviewers about a new comment from the PR author", () => {
    expect(
      names(prCommentCandidates({
        prAuthor: author, reviewers: [lead, other], commentAuthor: author, thread: { isReply: false },
      }))
    ).toEqual(["vunt_mb", "hungtq_mb"]);
  });

  it("falls back to author plus reviewers when the thread is unknown", () => {
    expect(
      names(prCommentCandidates({ prAuthor: author, reviewers: [lead], commentAuthor: other }))
    ).toEqual(["ngocdv", "vunt_mb"]);
  });
});
