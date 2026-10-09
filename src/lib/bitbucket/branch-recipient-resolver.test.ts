import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import {
  matchBitbucketUsersToLocalUsers,
  discoverPrJiraKeys,
  resolveTaskRecipients,
  excludeCommentAuthor,
  resolveBranchNotificationRecipients,
} from "./branch-recipient-resolver";
import { encrypt } from "@/lib/crypto";
import type { prisma } from "@/lib/prisma";

type MockDb = typeof prisma;

beforeAll(() => {
  process.env.CRED_ENCRYPTION_KEY = "0".repeat(64);
});

describe("branch-recipient-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("matchBitbucketUsersToLocalUsers", () => {
    it("returns empty array when candidates list is empty", async () => {
      const db = { user: { findMany: vi.fn() } } as unknown as MockDb;
      const result = await matchBitbucketUsersToLocalUsers([], db);
      expect(result).toEqual([]);
      expect((db as unknown as { user: { findMany: ReturnType<typeof vi.fn> } }).user.findMany).not.toHaveBeenCalled();
    });

    it("matches candidates by username alias and email", async () => {
      const mockFindMany = vi.fn();
      mockFindMany.mockResolvedValueOnce([
        { id: "u-1", jiraUsername: "anhnk", email: "anhnk@company.com" },
        { id: "u-2", jiraUsername: "vietpq", email: "viet@company.com" },
      ]);
      // Second call for bitbucketUserEnc fallback
      mockFindMany.mockResolvedValueOnce([]);

      const db = { user: { findMany: mockFindMany } } as unknown as MockDb;
      const candidates = [
        { name: "anhnk_mb" },
        { name: "vietpq", emailAddress: "VIET@company.com" },
      ];

      const result = await matchBitbucketUsersToLocalUsers(candidates, db);
      expect(result).toContain("u-1");
      expect(result).toContain("u-2");
      expect(result.length).toBe(2);
    });

    it("falls back to encrypted bitbucket username for matching", async () => {
      const mockFindMany = vi.fn();
      // First call by username/email finds none
      mockFindMany.mockResolvedValueOnce([]);
      // Second call finds user with bitbucketUserEnc
      const enc = encrypt("remote_dev");
      mockFindMany.mockResolvedValueOnce([
        { id: "u-enc", bitbucketUserEnc: enc },
      ]);

      const db = { user: { findMany: mockFindMany } } as unknown as MockDb;
      const candidates = [{ name: "remote_dev" }];

      const result = await matchBitbucketUsersToLocalUsers(candidates, db);
      expect(result).toEqual(["u-enc"]);
    });

    it("handles database query exceptions gracefully", async () => {
      const db = {
        user: {
          findMany: vi.fn().mockRejectedValue(new Error("Database offline")),
        },
      } as unknown as MockDb;

      const result = await matchBitbucketUsersToLocalUsers([{ name: "dev" }], db);
      expect(result).toEqual([]);
    });
  });

  describe("discoverPrJiraKeys", () => {
    it("extracts keys from branch, title, and existing branchInfo records", async () => {
      const db = {
        branchInfo: {
          findMany: vi.fn().mockResolvedValue([
            {
              jiraKey: "PROJ-100",
              branch: "feature/PROJ-101-sub",
              issueLinks: [{ jiraKey: "PROJ-102" }],
            },
          ]),
        },
      } as unknown as MockDb;

      const result = await discoverPrJiraKeys(
        "PROJ/repo",
        {
          id: 5,
          branch: "feature/PROJ-200-flow",
          title: "Fix issue PROJ-300 in payments",
        },
        db
      );

      expect(result).toContain("PROJ-200");
      expect(result).toContain("PROJ-300");
      expect(result).toContain("PROJ-100");
      expect(result).toContain("PROJ-101");
      expect(result).toContain("PROJ-102");
    });

    it("handles db branchInfo lookup error without failing", async () => {
      const db = {
        branchInfo: {
          findMany: vi.fn().mockRejectedValue(new Error("Table locked")),
        },
      } as unknown as MockDb;

      const result = await discoverPrJiraKeys(
        "PROJ/repo",
        { id: 10, branch: "feature/PROJ-404-safe" },
        db
      );

      expect(result).toEqual(["PROJ-404"]);
    });
  });

  describe("resolveTaskRecipients", () => {
    it("returns empty array for empty jiraKeys", async () => {
      const mockFindMany = vi.fn();
      const db = { issueCache: { findMany: mockFindMany }, watch: { findMany: vi.fn() } } as unknown as MockDb;
      const result = await resolveTaskRecipients([], db);
      expect(result).toEqual([]);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it("finds assignees and watchers for linked Jira issues", async () => {
      const db = {
        issueCache: {
          findMany: vi.fn().mockResolvedValue([
            { jiraKey: "TASK-1", assigneeJira: "anhnk_mb" },
          ]),
        },
        user: {
          findMany: vi.fn().mockResolvedValue([{ id: "user-assignee" }]),
        },
        watch: {
          findMany: vi.fn().mockResolvedValue([{ userId: "user-watcher" }]),
        },
      } as unknown as MockDb;

      const result = await resolveTaskRecipients(["TASK-1"], db);
      expect(result).toContain("user-assignee");
      expect(result).toContain("user-watcher");
      expect(result.length).toBe(2);
    });

    it("handles missing issueCache or watch models gracefully", async () => {
      const db = {
        issueCache: {
          findMany: vi.fn().mockRejectedValue(new Error("Missing cache table")),
        },
        watch: {
          findMany: vi.fn().mockRejectedValue(new Error("Missing watch table")),
        },
      } as unknown as MockDb;

      const result = await resolveTaskRecipients(["TASK-2"], db);
      expect(result).toEqual([]);
    });
  });

  describe("excludeCommentAuthor", () => {
    it("returns empty when userIds is empty", async () => {
      const mockFindMany = vi.fn();
      const db = { user: { findMany: mockFindMany } } as unknown as MockDb;
      const result = await excludeCommentAuthor([], { name: "author" }, db);
      expect(result).toEqual([]);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it("strictly excludes comment author by alias, email, and encrypted credentials", async () => {
      const authorEnc = encrypt("anhnk_mb");
      const db = {
        user: {
          findMany: vi.fn().mockResolvedValue([
            { id: "u-author-alias", jiraUsername: "anhnk_mb" },
            { id: "u-author-email", email: "author@corp.vn" },
            { id: "u-author-enc", bitbucketUserEnc: authorEnc },
            { id: "u-innocent", jiraUsername: "bob", email: "bob@corp.vn" },
          ]),
        },
      } as unknown as MockDb;

      const result = await excludeCommentAuthor(
        ["u-author-alias", "u-author-email", "u-author-enc", "u-innocent"],
        { name: "anhnk", emailAddress: "AUTHOR@corp.vn" },
        db
      );

      expect(result).toEqual(["u-innocent"]);
    });

    it("retains all users if db check fails", async () => {
      const db = {
        user: {
          findMany: vi.fn().mockRejectedValue(new Error("DB error")),
        },
      } as unknown as MockDb;

      const result = await excludeCommentAuthor(["u-1", "u-2"], { name: "someone" }, db);
      expect(result).toEqual(["u-1", "u-2"]);
    });
  });

  describe("resolveBranchNotificationRecipients", () => {
    it("orchestrates candidates, task recipients, and author exclusion", async () => {
      const mockUserFindMany = vi.fn();
      // Candidate matching - 1st call
      mockUserFindMany.mockResolvedValueOnce([
        { id: "u-reviewer", jiraUsername: "rev_jira", email: "rev@corp.com" },
      ]);
      // Candidate matching fallback - 2nd call
      mockUserFindMany.mockResolvedValueOnce([]);
      // Task assignee query - 3rd call
      mockUserFindMany.mockResolvedValueOnce([{ id: "u-assignee" }]);
      // Author exclusion verification - 4th call
      mockUserFindMany.mockResolvedValueOnce([
        { id: "u-reviewer", jiraUsername: "rev_jira" },
        { id: "u-assignee", jiraUsername: "ass_jira" },
        { id: "u-watcher", jiraUsername: "watch_jira" },
      ]);

      const db = {
        user: { findMany: mockUserFindMany },
        issueCache: {
          findMany: vi.fn().mockResolvedValue([{ jiraKey: "EPM-1", assigneeJira: "ass_jira" }]),
        },
        watch: {
          findMany: vi.fn().mockResolvedValue([{ userId: "u-watcher" }]),
        },
      } as unknown as MockDb;

      const result = await resolveBranchNotificationRecipients({
        candidates: [
          { name: "author_jira" }, // Should be filtered because it matches commentAuthor
          { name: "rev_jira" },
        ],
        jiraKeys: ["EPM-1"],
        commentAuthor: { name: "author_jira" },
        db,
      });

      expect(result).toContain("u-reviewer");
      expect(result).toContain("u-assignee");
      expect(result).toContain("u-watcher");
      expect(result).not.toContain("author_jira");
      expect(result.length).toBe(3);
    });
  });
});
