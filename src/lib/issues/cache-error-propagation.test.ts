/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  upsertJiraComments,
  upsertJiraCommentsWithNew,
  isPrismaUniqueConstraintError,
} from "./cache";
import { prisma } from "@/lib/prisma";
import type { JiraComment } from "@/lib/jira/types";

vi.mock("@/lib/jira/client", () => ({
  jira: { search: vi.fn(), getComments: vi.fn() },
  parseJiraDate: (d?: string) => (d ? new Date(d) : null),
  jiraPointsFromFields: () => ({ points: null, fieldId: null }),
  jiraIssueFields: () => "summary,status",
}));

vi.mock("@/lib/issues/notify-watchers", () => ({
  notifyWatchersOfIssueChange: vi.fn().mockResolvedValue(undefined),
  notifyWatchersOfComment: vi.fn().mockResolvedValue(undefined),
}));

describe("PR 3 — Error Propagation & Notification Safety", () => {
  type CommentRecord = {
    id: string;
    jiraCommentId: string | null;
    jiraKey: string;
    author: string;
    body: string;
    createdAt: Date | null;
    updatedAt: Date | null;
    syncedAt: Date;
  };

  let commentStore: Map<string, CommentRecord>;

  beforeEach(() => {
    vi.clearAllMocks();
    commentStore = new Map();

    vi.spyOn(prisma.commentCache as any, "findFirst").mockResolvedValue(null);

    vi.spyOn(prisma.commentCache as any, "findUnique").mockImplementation(
      async ({ where }: any) => {
        if (where.jiraCommentId) {
          for (const c of commentStore.values()) {
            if (c.jiraCommentId === where.jiraCommentId) return c;
          }
        }
        return null;
      }
    );

    vi.spyOn(prisma.commentCache as any, "create").mockImplementation(
      async ({ data }: any) => {
        // Check for duplicate jiraCommentId
        for (const c of commentStore.values()) {
          if (c.jiraCommentId === data.jiraCommentId) {
            const err = new Error("Unique constraint failed");
            (err as any).code = "P2002";
            throw err;
          }
        }
        const id = `comm-${commentStore.size + 1}`;
        const record: CommentRecord = { id, ...data };
        commentStore.set(id, record);
        return record;
      }
    );

    vi.spyOn(prisma.commentCache as any, "updateMany").mockImplementation(
      async ({ where, data }: any) => {
        let count = 0;
        for (const record of commentStore.values()) {
          if (where.jiraCommentId && record.jiraCommentId !== where.jiraCommentId) continue;
          if (where.OR) {
            const matchesOr = where.OR.some((clause: any) => {
              if (clause.updatedAt === null && record.updatedAt === null) return true;
              if (
                clause.updatedAt?.lte &&
                record.updatedAt &&
                record.updatedAt <= clause.updatedAt.lte
              )
                return true;
              return false;
            });
            if (!matchesOr) continue;
          }
          Object.assign(record, data);
          count++;
        }
        return { count };
      }
    );

    // $transaction passthrough for comment tests
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      return callback(prisma);
    });
  });

  // Test: P2002 is handled as normal race
  it("P2002 on comment create is handled as race, not thrown", async () => {
    // Pre-populate a comment
    commentStore.set("existing", {
      id: "existing",
      jiraCommentId: "1001",
      jiraKey: "EPM-1",
      author: "alice",
      body: "First version",
      createdAt: new Date("2026-09-30T09:00:00.000Z"),
      updatedAt: new Date("2026-09-30T09:00:00.000Z"),
      syncedAt: new Date(),
    });

    const comments: JiraComment[] = [
      {
        id: "1001",
        body: "Updated version",
        author: { name: "alice" },
        created: "2026-09-30T09:00:00.000Z",
        updated: "2026-09-30T10:00:00.000Z",
      } as JiraComment,
    ];

    // Should not throw — P2002 on create triggers a conditional update retry
    const synced = await upsertJiraComments("EPM-1", comments);
    // The updateMany should match because incoming updatedAt >= stored updatedAt
    expect(synced).toBe(1);
  });

  // Test: Connection error on comment create IS thrown
  it("database connection error on comment create IS thrown", async () => {
    // Override create to throw a connection error
    vi.spyOn(prisma.commentCache as any, "create").mockRejectedValue(
      new Error("Connection refused: PostgreSQL is down")
    );

    // Override findUnique to return null so it reaches the create branch
    vi.spyOn(prisma.commentCache as any, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.commentCache as any, "updateMany").mockResolvedValue({ count: 0 });

    const comments: JiraComment[] = [
      {
        id: "2001",
        body: "A comment",
        author: { name: "bob" },
        created: "2026-09-30T09:00:00.000Z",
        updated: "2026-09-30T09:00:00.000Z",
      } as JiraComment,
    ];

    await expect(upsertJiraComments("EPM-1", comments)).rejects.toThrow(
      "Connection refused"
    );
  });

  // Test: Two workers create same comment → only one notification
  it("two workers creating same comment results in only one newComment entry", async () => {
    const comments: JiraComment[] = [
      {
        id: "3001",
        body: "Shared comment",
        author: { name: "charlie" },
        created: "2026-09-30T09:00:00.000Z",
        updated: "2026-09-30T09:00:00.000Z",
      } as JiraComment,
    ];

    // Worker 1 creates successfully
    const result1 = await upsertJiraCommentsWithNew("EPM-1", comments);
    expect(result1.synced).toBe(1);
    expect(result1.newComments).toHaveLength(1);

    // Worker 2 tries to create the same comment → P2002 race
    // findUnique will now return the existing record
    const result2 = await upsertJiraCommentsWithNew("EPM-1", comments);
    // P2002 → read back → same updatedAt → retry update → count should be 1 (idempotent)
    expect(result2.synced).toBe(1);
    // But newComments should be empty since it was a P2002 race, not a new create
    expect(result2.newComments).toHaveLength(0);
  });

  // Test: Comment save fails → cursor should not advance (tested via stats.errors in syncProject)
  it("comment create failure with non-P2002 adds error to calling context", async () => {
    vi.spyOn(prisma.commentCache as any, "create").mockRejectedValue(
      new Error("Timeout exceeded")
    );
    vi.spyOn(prisma.commentCache as any, "findUnique").mockResolvedValue(null);
    vi.spyOn(prisma.commentCache as any, "updateMany").mockResolvedValue({ count: 0 });

    const comments: JiraComment[] = [
      {
        id: "4001",
        body: "Failing comment",
        author: { name: "dave" },
        created: "2026-09-30T09:00:00.000Z",
        updated: "2026-09-30T09:00:00.000Z",
      } as JiraComment,
    ];

    // Should throw so the caller can add to stats.errors
    await expect(upsertJiraCommentsWithNew("EPM-1", comments)).rejects.toThrow(
      "Timeout exceeded"
    );
  });
});

describe("isPrismaUniqueConstraintError edge cases", () => {
  it("detects P2002 via code property on plain object", () => {
    expect(isPrismaUniqueConstraintError({ code: "P2002" })).toBe(true);
  });

  it("returns false for connection errors", () => {
    const err = new Error("P2025: An operation failed");
    (err as any).code = "P2025";
    expect(isPrismaUniqueConstraintError(err)).toBe(false);
  });

  it("returns false for foreign key errors", () => {
    const err = new Error("Foreign key constraint failed");
    (err as any).code = "P2003";
    expect(isPrismaUniqueConstraintError(err)).toBe(false);
  });
});
