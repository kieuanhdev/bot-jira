/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimJiraSyncLease,
  releaseJiraSyncLease,
  SyncLeaseLostError,
} from "./jira-sync-lease";
import { syncProject } from "./workers/poll-jira";
import { upsertJiraIssue, upsertJiraCommentsWithNew } from "@/lib/issues/cache";
import { prisma } from "@/lib/prisma";
import { jira } from "@/lib/jira/client";
import type { JiraIssue } from "@/lib/jira/types";

// Mock external client dependencies
vi.mock("@/lib/jira/client", () => ({
  jira: {
    search: vi.fn(),
    getComments: vi.fn(),
  },
  parseJiraDate: (d?: string) => (d ? new Date(d) : null),
  jiraPointsFromFields: () => ({ points: null, fieldId: null }),
}));

vi.mock("@/lib/issues/notify-watchers", () => ({
  notifyWatchersOfIssueChange: vi.fn().mockResolvedValue(undefined),
  notifyWatchersOfComment: vi.fn().mockResolvedValue(undefined),
}));

describe("Jira Sync Race & Lease Scenarios", () => {
  type CursorRecord = {
    id: string;
    integration: string;
    scope: string;
    cursor: string | null;
    lastStartedAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorAt: Date | null;
    lastError: string | null;
    stats: any;
    activeRunToken: string | null;
    activeRunStartedAt: Date | null;
    activeRunExpiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  type IssueRecord = {
    jiraKey: string;
    projectKey: string;
    summary: string;
    description: string;
    status: string;
    statusCategory: string;
    updatedAt: Date | null;
    deletedAt: Date | null;
    [key: string]: any;
  };

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

  type LinkRecord = {
    id: string;
    jiraLinkId: string;
    outwardKey: string;
    inwardKey: string;
    deletedAt: Date | null;
    [key: string]: any;
  };

  let cursorStore: Map<string, CursorRecord>;
  let issueStore: Map<string, IssueRecord>;
  let commentStore: Map<string, CommentRecord>;
  let linkStore: Map<string, LinkRecord>;

  beforeEach(() => {
    vi.clearAllMocks();
    cursorStore = new Map();
    issueStore = new Map();
    commentStore = new Map();
    linkStore = new Map();

    // In-memory simulation of prisma for atomic operations
    vi.spyOn(prisma.integrationCursor as any, "upsert").mockImplementation(async ({ where, create }: any) => {
      const key = `${where.integration_scope.integration}:${where.integration_scope.scope}`;
      if (!cursorStore.has(key)) {
        const record: CursorRecord = {
          id: `cur-${key}`,
          integration: create.integration,
          scope: create.scope,
          cursor: create.cursor ?? null,
          lastStartedAt: create.lastStartedAt ?? null,
          lastSuccessAt: create.lastSuccessAt ?? null,
          lastErrorAt: null,
          lastError: null,
          stats: null,
          activeRunToken: create.activeRunToken ?? null,
          activeRunStartedAt: create.activeRunStartedAt ?? null,
          activeRunExpiresAt: create.activeRunExpiresAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        cursorStore.set(key, record);
      }
      return cursorStore.get(key)!;
    });

    vi.spyOn(prisma.integrationCursor as any, "findUnique").mockImplementation(async ({ where }: any) => {
      if (where.id) {
        for (const record of cursorStore.values()) {
          if (record.id === where.id) return record;
        }
      }
      if (where.integration_scope) {
        const key = `${where.integration_scope.integration}:${where.integration_scope.scope}`;
        return cursorStore.get(key) ?? null;
      }
      return null;
    });

    vi.spyOn(prisma.integrationCursor as any, "updateMany").mockImplementation(async ({ where, data }: any) => {
      let count = 0;
      for (const record of cursorStore.values()) {
        if (where.integration && record.integration !== where.integration) continue;
        if (where.scope && record.scope !== where.scope) continue;
        if (where.id && record.id !== where.id) continue;
        if (where.activeRunToken && record.activeRunToken !== where.activeRunToken) continue;

        if (where.OR) {
          const matchesOr = where.OR.some((clause: any) => {
            if ("activeRunToken" in clause) {
              if (clause.activeRunToken === null && record.activeRunToken === null) return true;
              if (clause.activeRunToken !== null && record.activeRunToken === clause.activeRunToken) return true;
            }
            if ("activeRunExpiresAt" in clause) {
              if (clause.activeRunExpiresAt === null && record.activeRunExpiresAt === null) return true;
              if (clause.activeRunExpiresAt?.lte && record.activeRunExpiresAt && record.activeRunExpiresAt <= clause.activeRunExpiresAt.lte) return true;
            }
            return false;
          });
          if (!matchesOr) continue;
        }

        Object.assign(record, data, { updatedAt: new Date() });
        count++;
      }
      return { count };
    });

    vi.spyOn(prisma.issueCache as any, "findUnique").mockImplementation(async ({ where }: any) => {
      return issueStore.get(where.jiraKey) ?? null;
    });

    vi.spyOn(prisma.issueCache as any, "create").mockImplementation(async ({ data }: any) => {
      if (issueStore.has(data.jiraKey)) {
        throw new Error("P2002: Unique constraint violation");
      }
      issueStore.set(data.jiraKey, { ...data, deletedAt: null });
      return issueStore.get(data.jiraKey)!;
    });

    vi.spyOn(prisma.issueCache as any, "updateMany").mockImplementation(async ({ where, data }: any) => {
      let count = 0;
      for (const record of issueStore.values()) {
        if (where.jiraKey && record.jiraKey !== where.jiraKey) continue;
        if (where.projectKey && record.projectKey !== where.projectKey) continue;
        if (where.deletedAt === null && record.deletedAt !== null) continue;
        if (where.jiraKey?.notIn && where.jiraKey.notIn.includes(record.jiraKey)) continue;

        if (where.OR) {
          const matchesOr = where.OR.some((clause: any) => {
            if (clause.updatedAt === null && record.updatedAt === null) return true;
            if (clause.updatedAt?.lte && record.updatedAt && record.updatedAt <= clause.updatedAt.lte) return true;
            return false;
          });
          if (!matchesOr) continue;
        }

        Object.assign(record, data);
        count++;
      }
      return { count };
    });

    vi.spyOn(prisma.commentCache as any, "findUnique").mockImplementation(async ({ where }: any) => {
      if (where.jiraCommentId) {
        for (const c of commentStore.values()) {
          if (c.jiraCommentId === where.jiraCommentId) return c;
        }
      }
      return null;
    });

    vi.spyOn(prisma.commentCache as any, "create").mockImplementation(async ({ data }: any) => {
      const id = `comm-${commentStore.size + 1}`;
      const record = { id, ...data };
      commentStore.set(id, record);
      return record;
    });

    vi.spyOn(prisma.commentCache as any, "updateMany").mockImplementation(async ({ where, data }: any) => {
      let count = 0;
      for (const record of commentStore.values()) {
        if (where.jiraCommentId && record.jiraCommentId !== where.jiraCommentId) continue;
        if (where.OR) {
          const matchesOr = where.OR.some((clause: any) => {
            if (clause.updatedAt === null && record.updatedAt === null) return true;
            if (clause.updatedAt?.lte && record.updatedAt && record.updatedAt <= clause.updatedAt.lte) return true;
            return false;
          });
          if (!matchesOr) continue;
        }
        Object.assign(record, data);
        count++;
      }
      return { count };
    });

    vi.spyOn(prisma.issueLinkCache as any, "upsert").mockImplementation(async ({ where, create, update }: any) => {
      if (!linkStore.has(where.jiraLinkId)) {
        linkStore.set(where.jiraLinkId, { id: `link-${where.jiraLinkId}`, ...create });
      } else {
        Object.assign(linkStore.get(where.jiraLinkId)!, update);
      }
      return linkStore.get(where.jiraLinkId)!;
    });

    vi.spyOn(prisma.issueLinkCache as any, "updateMany").mockImplementation(async ({ where, data }: any) => {
      let count = 0;
      for (const link of linkStore.values()) {
        if (where.jiraLinkId?.notIn && where.jiraLinkId.notIn.includes(link.jiraLinkId)) {
          Object.assign(link, data);
          count++;
        }
      }
      return { count };
    });

    // Mock transaction to execute callback with prisma
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      return callback(prisma);
    });
  });

  // 1. Job A nhận issue cũ, Job B ghi issue mới, Job A hoàn thành sau → cache vẫn giữ dữ liệu Job B.
  it("1. Job A receives stale issue, Job B writes new issue, Job A finishes later -> cache preserves Job B data", async () => {
    // Job B writes new issue at 10:00
    const newIssue: JiraIssue = {
      id: "101",
      key: "EPM-1",
      self: "",
      fields: {
        project: { key: "EPM" },
        summary: "New Status from Job B",
        status: { name: "In Progress" },
        updated: "2026-09-30T10:00:00.000Z",
      },
    };
    const resB = await upsertJiraIssue(newIssue);
    expect(resB.applied).toBe(true);
    expect(issueStore.get("EPM-1")?.summary).toBe("New Status from Job B");

    // Job A arrives later with stale payload from 09:00
    const staleIssue: JiraIssue = {
      id: "101",
      key: "EPM-1",
      self: "",
      fields: {
        project: { key: "EPM" },
        summary: "Stale Status from Job A",
        status: { name: "To Do" },
        updated: "2026-09-30T09:00:00.000Z",
      },
    };
    const resA = await upsertJiraIssue(staleIssue);
    expect(resA.applied).toBe(false);
    // Cache preserves Job B data
    expect(issueStore.get("EPM-1")?.summary).toBe("New Status from Job B");
  });

  // 2. Job B tiếp quản lease → Job A không cập nhật cursor.
  it("2. Job B takes over lease -> Job A does not update cursor", async () => {
    // Initial cursor
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-30T08:00:00.000Z",
      lastStartedAt: new Date("2026-09-30T08:00:00.000Z"),
      lastSuccessAt: new Date("2026-09-30T08:00:00.000Z"),
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(jira.search).mockImplementation(async () => {
      // Simulate Job B stealing lease while Job A is searching
      const record = cursorStore.get("jira:EPM")!;
      record.activeRunToken = "token_Job_B";
      return {
        startAt: 0,
        maxResults: 50,
        total: 1,
        issues: [
          {
            id: "10001",
            key: "EPM-1",
            self: "https://jira.example.com/rest/api/2/issue/10001",
            fields: {
              updated: "2026-09-30T09:30:00.000Z",
              comment: { total: 0, comments: [] },
            },
          },
        ],
      };
    });

    // Job A runs with token_Job_A
    await expect(syncProject("EPM", false, { runToken: "token_Job_A" })).rejects.toThrow(
      SyncLeaseLostError
    );

    // Cursor remains unchanged from before Job A
    expect(cursorStore.get("jira:EPM")?.cursor).toBe("2026-09-30T08:00:00.000Z");
  });

  // 3. Job B tiếp quản lease → Job A không ghi lastErrorAt.
  it("3. Job B takes over lease -> Job A does not write lastErrorAt", async () => {
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-30T08:00:00.000Z",
      lastStartedAt: new Date(),
      lastSuccessAt: new Date(),
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(jira.search).mockImplementation(async () => {
      // Job B takes over
      cursorStore.get("jira:EPM")!.activeRunToken = "token_Job_B";
      throw new Error("Job A encounters Jira error");
    });

    await expect(syncProject("EPM", false, { runToken: "token_Job_A" })).rejects.toThrow();

    // lastErrorAt was NOT written by Job A because lease was lost to Job B
    expect(cursorStore.get("jira:EPM")?.lastErrorAt).toBeNull();
    expect(cursorStore.get("jira:EPM")?.lastError).toBeNull();
  });

  // 4. Job A full scan mất lease trước finalize → không soft-delete.
  it("4. Job A full scan loses lease before finalize -> does not soft-delete", async () => {
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: null,
      lastStartedAt: new Date(),
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Existing issue in cache
    issueStore.set("EPM-OLD", {
      jiraKey: "EPM-OLD",
      projectKey: "EPM",
      summary: "Old issue",
      description: "",
      status: "Done",
      statusCategory: "done",
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
      deletedAt: null,
    });

    vi.mocked(jira.search).mockResolvedValue({
      startAt: 0,
      maxResults: 50,
      total: 1,
      issues: [
        {
          id: "10002",
          key: "EPM-NEW",
          self: "https://jira.example.com/rest/api/2/issue/10002",
          fields: {
            updated: "2026-09-30T09:00:00.000Z",
            comment: { total: 0, comments: [] },
          },
        },
      ],
    });

    // Before transaction finalize runs, lease is changed to Job B
    vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (cb: any) => {
      cursorStore.get("jira:EPM")!.activeRunToken = "token_Job_B";
      return cb(prisma);
    });

    await expect(syncProject("EPM", true, { runToken: "token_Job_A" })).rejects.toThrow(
      SyncLeaseLostError
    );

    // EPM-OLD must NOT be soft-deleted
    expect(issueStore.get("EPM-OLD")?.deletedAt).toBeNull();
  });

  // 5. Job abort giữa pagination → release lease của chính nó.
  it("5. Job aborted mid-pagination -> releases its own lease", async () => {
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: null,
      lastStartedAt: new Date(),
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const controller = new AbortController();

    vi.mocked(jira.search).mockImplementation(async () => {
      controller.abort();
      return {
        startAt: 0,
        maxResults: 50,
        total: 100,
        issues: [
          {
            id: "10001",
            key: "EPM-1",
            self: "https://jira.example.com/rest/api/2/issue/10001",
            fields: { updated: "2026-09-30T09:00:00.000Z" },
          },
        ],
      };
    });

    await expect(
      syncProject("EPM", false, { signal: controller.signal, runToken: "token_abort" })
    ).rejects.toThrow();

    // Lease was released in finally
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBeNull();
  });

  // 6. Job cũ không được release lease của job mới.
  it("6. Stale job must not release lease acquired by new job", async () => {
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: null,
      lastStartedAt: new Date(),
      lastSuccessAt: null,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: "token_Job_B", // Job B already holds the lease
      activeRunStartedAt: new Date(),
      activeRunExpiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Old Job A calls releaseJiraSyncLease with its old token_Job_A
    const released = await releaseJiraSyncLease("EPM", "token_Job_A");
    expect(released).toBe(false);

    // Job B's activeRunToken is preserved!
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_Job_B");
  });

  // 7. Comment payload cũ không ghi đè comment mới.
  it("7. Stale comment payload does not overwrite new comment body", async () => {
    commentStore.set("comm-1", {
      id: "comm-1",
      jiraCommentId: "1001",
      jiraKey: "EPM-1",
      author: "alice",
      body: "Newer comment text from Job B",
      createdAt: new Date("2026-09-30T09:00:00.000Z"),
      updatedAt: new Date("2026-09-30T10:00:00.000Z"),
      syncedAt: new Date(),
    });

    // Stale comment arrives with older updatedAt (09:30) and older body
    const staleComments = [
      {
        id: "1001",
        body: "Older comment text from Job A",
        author: { name: "alice" },
        created: "2026-09-30T09:00:00.000Z",
        updated: "2026-09-30T09:30:00.000Z",
      },
    ];

    const { newComments } = await upsertJiraCommentsWithNew("EPM-1", staleComments as any);
    expect(newComments).toHaveLength(0);
    // Comment text remains newer Job B text
    expect(commentStore.get("comm-1")?.body).toBe("Newer comment text from Job B");
  });

  // 8. Issue payload cũ không soft-delete links.
  it("8. Stale issue payload does not soft-delete active links", async () => {
    // Current issue in DB
    issueStore.set("EPM-1", {
      jiraKey: "EPM-1",
      projectKey: "EPM",
      summary: "Task",
      description: "",
      status: "In Progress",
      statusCategory: "indeterminate",
      updatedAt: new Date("2026-09-30T10:00:00.000Z"),
      deletedAt: null,
    });

    // Existing link
    linkStore.set("link-1", {
      id: "l-1",
      jiraLinkId: "link-1",
      outwardKey: "EPM-1",
      inwardKey: "EPM-2",
      deletedAt: null,
    });

    // Stale issue with empty issuelinks array arrives from earlier snapshot
    const staleIssueWithNoLinks: JiraIssue = {
      id: "101",
      key: "EPM-1",
      self: "",
      fields: {
        project: { key: "EPM" },
        summary: "Old Task",
        updated: "2026-09-30T09:00:00.000Z",
        issuelinks: [],
      },
    };

    const res = await upsertJiraIssue(staleIssueWithNoLinks);
    expect(res.applied).toBe(false);

    // Active link is NOT soft-deleted
    expect(linkStore.get("link-1")?.deletedAt).toBeNull();
  });

  // 9. Sync bình thường cập nhật cursor và release lease.
  it("9. Normal sync advances cursor and releases lease upon completion", async () => {
    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-30T08:00:00.000Z",
      lastStartedAt: new Date("2026-09-30T08:00:00.000Z"),
      lastSuccessAt: new Date("2026-09-30T08:00:00.000Z"),
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(jira.search).mockResolvedValue({
      startAt: 0,
      maxResults: 50,
      total: 1,
      issues: [
        {
          id: "10001",
          key: "EPM-1",
          self: "https://jira.example.com/rest/api/2/issue/10001",
          fields: {
            updated: "2026-09-30T09:15:00.000Z",
            comment: { total: 0, comments: [] },
          },
        },
      ],
    });

    const stats = await syncProject("EPM", false, { runToken: "token_normal" });

    expect(stats.cursor).toBe("2026-09-30T09:15:00.000Z");
    expect(stats.cursorAdvanced).toBe(true);

    const updatedCursor = cursorStore.get("jira:EPM")!;
    expect(updatedCursor.cursor).toBe("2026-09-30T09:15:00.000Z");
    expect(updatedCursor.lastSuccessAt).toBeDefined();
    // Lease is released
    expect(updatedCursor.activeRunToken).toBeNull();
    expect(updatedCursor.activeRunExpiresAt).toBeNull();
  });

  // 10. Process chết để lại lease → job mới claim được sau activeRunExpiresAt.
  it("10. Dead process leaves lease -> new job can claim after activeRunExpiresAt", async () => {
    const expiredAt = new Date(Date.now() - 10000); // 10 seconds ago

    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-30T08:00:00.000Z",
      lastStartedAt: new Date(Date.now() - 60000),
      lastSuccessAt: new Date(Date.now() - 60000),
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: "token_crashed_worker",
      activeRunStartedAt: new Date(Date.now() - 60000),
      activeRunExpiresAt: expiredAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // New worker boots up and claims lease
    const now = new Date();
    const newExpiresAt = new Date(Date.now() + 600000);
    const claimed = await claimJiraSyncLease("EPM", "token_new_worker", newExpiresAt, now);

    expect(claimed.activeRunToken).toBe("token_new_worker");
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_new_worker");
  });
});
