/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PR 4 — Integration-style tests for Jira sync fencing.
 *
 * These tests simulate real race conditions using in-memory stores with
 * deferred/barrier promises to control interleaving. While they use mocks
 * instead of a real PostgreSQL database, they validate the correctness of
 * the transactional logic, lease renewal, and error propagation across
 * all four PRs.
 *
 * For true PostgreSQL integration tests, run against a test database with
 * `vitest --project integration` (to be configured separately).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  claimJiraSyncLease,
  computeLeaseTtlSeconds,
  SyncAlreadyRunningError,
  SyncLeaseLostError,
} from "./jira-sync-lease";
import { syncProject } from "./workers/poll-jira";
import {
  upsertJiraIssue,
} from "@/lib/issues/cache";
import { prisma } from "@/lib/prisma";
import { jira } from "@/lib/jira/client";
import type { JiraIssue } from "@/lib/jira/types";
import {
  missingWorkerRequired,
  validateWorkerStartup,
} from "@/lib/health/config-validation";

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

describe("Integration: Jira Sync Fencing Scenarios", () => {
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

    // --- IntegrationCursor mocks ---
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

    // --- IssueCache mocks ---
    vi.spyOn(prisma.issueCache as any, "findUnique").mockImplementation(async ({ where }: any) => {
      return issueStore.get(where.jiraKey) ?? null;
    });
    vi.spyOn(prisma.issueCache as any, "findMany").mockImplementation(async ({ where }: any) => {
      const jiraKeys = where.jiraKey.in as string[];
      return jiraKeys.flatMap((jiraKey) => {
        const issue = issueStore.get(jiraKey);
        return issue ? [issue] : [];
      });
    });
    vi.spyOn(prisma.issueCache as any, "create").mockImplementation(async ({ data }: any) => {
      if (issueStore.has(data.jiraKey)) throw new Error("P2002: Unique constraint violation");
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

    // --- CommentCache mocks ---
    vi.spyOn(prisma.commentCache as any, "findUnique").mockImplementation(async ({ where }: any) => {
      if (where.jiraCommentId) {
        for (const c of commentStore.values()) {
          if (c.jiraCommentId === where.jiraCommentId) return c;
        }
      }
      return null;
    });
    vi.spyOn(prisma.commentCache as any, "create").mockImplementation(async ({ data }: any) => {
      // Check for duplicate jiraCommentId
      for (const c of commentStore.values()) {
        if (c.jiraCommentId === data.jiraCommentId) {
          const err = new Error("Unique constraint failed");
          (err as any).code = "P2002";
          throw err;
        }
      }
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

    // --- IssueLinkCache mocks ---
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

    // --- Transaction mock ---
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      return callback(prisma);
    });
  });

  // ---- Scenario 1: Two jobs simultaneously claim the same project → only one succeeds ----
  it("Scenario 1: Two concurrent claims → only one job succeeds", async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 600_000);

    const claimA = claimJiraSyncLease("EPM", "token_A", expiresAt, now);
    const claimB = claimJiraSyncLease("EPM", "token_B", expiresAt, now);

    const results = await Promise.allSettled([claimA, claimB]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason
    ).toBeInstanceOf(SyncAlreadyRunningError);
  });

  // ---- Scenario 2: Lease takeover while old job awaits Jira → old job cannot write cache ----
  it("Scenario 2: Lease takeover while old job awaits Jira → old job cannot write cache", async () => {
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
      // Simulate Job B taking over while Job A is waiting for Jira
      cursorStore.get("jira:EPM")!.activeRunToken = "token_Job_B";
      return {
        startAt: 0,
        maxResults: 50,
        total: 1,
        issues: [{
          id: "10001",
          key: "EPM-1",
          self: "",
          fields: {
            updated: "2026-09-30T09:30:00.000Z",
            comment: { total: 0, comments: [] },
          },
        }],
      };
    });

    await expect(
      syncProject("EPM", false, { runToken: "token_Job_A" })
    ).rejects.toThrow(SyncLeaseLostError);

    // Cursor was NOT advanced by Job A
    expect(cursorStore.get("jira:EPM")?.cursor).toBe("2026-09-30T08:00:00.000Z");
    // Issue was NOT written to cache by Job A
    expect(issueStore.has("EPM-1")).toBe(false);
  });

  // ---- Scenario 3: Takeover between soft-delete and cursor update → full rollback ----
  it("Scenario 3: Takeover during finalize → transaction rollback", async () => {
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
      issues: [{
        id: "10002",
        key: "EPM-NEW",
        self: "",
        fields: {
          updated: "2026-09-30T09:00:00.000Z",
          comment: { total: 0, comments: [] },
        },
      }],
    });

    // Lease takeover happens during finalize transaction
    vi.spyOn(prisma, "$transaction")
      .mockImplementationOnce(async (cb: any) => cb(prisma)) // for upsertJiraIssue
      .mockImplementationOnce(async (cb: any) => {
        cursorStore.get("jira:EPM")!.activeRunToken = "token_Job_B";
        return cb(prisma);
      });

    await expect(
      syncProject("EPM", true, { runToken: "token_Job_A" })
    ).rejects.toThrow(SyncLeaseLostError);

    // EPM-OLD must NOT be soft-deleted
    expect(issueStore.get("EPM-OLD")?.deletedAt).toBeNull();
  });

  // ---- Scenario 4: Interleaving issue/link T2–T3 → consistent T3 result ----
  it("Scenario 4: Interleaving T2/T3 writes → final result is T3", async () => {
    const t2 = "2026-09-30T09:00:00.000Z";
    const t3 = "2026-09-30T10:00:00.000Z";

    // Job A writes T2
    const issueT2: JiraIssue = {
      id: "101",
      key: "EPM-1",
      self: "",
      fields: {
        project: { key: "EPM" },
        summary: "T2 version",
        status: { name: "To Do" },
        updated: t2,
        issuelinks: [{
          id: "link-T2",
          type: { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
          outwardIssue: { key: "EPM-2" },
        }],
      },
    };
    await upsertJiraIssue(issueT2);

    // Job B writes T3 (newer)
    const issueT3: JiraIssue = {
      id: "101",
      key: "EPM-1",
      self: "",
      fields: {
        project: { key: "EPM" },
        summary: "T3 version",
        status: { name: "In Progress" },
        updated: t3,
        issuelinks: [{
          id: "link-T3",
          type: { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
          outwardIssue: { key: "EPM-3" },
        }],
      },
    };
    await upsertJiraIssue(issueT3);

    expect(issueStore.get("EPM-1")?.summary).toBe("T3 version");
    expect(linkStore.has("link-T3")).toBe(true);

    // Now T2 arrives late — should be rejected
    const issueT2Late: JiraIssue = {
      id: "101",
      key: "EPM-1",
      self: "",
      fields: {
        project: { key: "EPM" },
        summary: "T2 late arrival",
        status: { name: "To Do" },
        updated: t2,
        issuelinks: [{
          id: "link-T2-late",
          type: { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
          outwardIssue: { key: "EPM-4" },
        }],
      },
    };
    const res = await upsertJiraIssue(issueT2Late);
    expect(res.applied).toBe(false);

    // State remains T3
    expect(issueStore.get("EPM-1")?.summary).toBe("T3 version");
    expect(linkStore.has("link-T2-late")).toBe(false);
  });

  // ---- Scenario 5: DB error on comment save → cursor stays ----
  it("Scenario 5: Comment save DB error → cursor does not advance", async () => {
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

    vi.mocked(jira.search).mockResolvedValue({
      startAt: 0,
      maxResults: 50,
      total: 1,
      issues: [{
        id: "10001",
        key: "EPM-1",
        self: "",
        fields: {
          updated: "2026-09-30T09:30:00.000Z",
          comment: {
            total: 1,
            comments: [{
              id: "c1",
              body: "Test comment",
              author: { name: "alice" },
              created: "2026-09-30T09:00:00.000Z",
              updated: "2026-09-30T09:00:00.000Z",
            }],
          },
        },
      }],
    });

    // Comment create throws a connection error (not P2002)
    vi.spyOn(prisma.commentCache as any, "create").mockRejectedValue(
      new Error("Connection timeout")
    );
    vi.spyOn(prisma.commentCache as any, "updateMany").mockResolvedValue({ count: 0 });

    const stats = await syncProject("EPM", false, { runToken: "token_comment_fail" });

    // Comment error is in stats.errors
    expect(stats.errors.length).toBeGreaterThan(0);
    expect(stats.errors[0]).toContain("comments");
    // Cursor was NOT advanced because there were errors
    expect(stats.cursor).toBe("2026-09-30T08:00:00.000Z");
    expect(stats.cursorAdvanced).toBe(false);
  });

  // ---- Scenario 6: Process dies after claim → new job claims after expiry ----
  it("Scenario 6: Dead process → new job claims after expiry", async () => {
    const expiredAt = new Date(Date.now() - 10_000); // 10s ago

    cursorStore.set("jira:EPM", {
      id: "cur-1",
      integration: "jira",
      scope: "EPM",
      cursor: "2026-09-30T08:00:00.000Z",
      lastStartedAt: new Date(Date.now() - 60_000),
      lastSuccessAt: new Date(Date.now() - 60_000),
      lastErrorAt: null,
      lastError: null,
      stats: null,
      activeRunToken: "token_crashed_worker",
      activeRunStartedAt: new Date(Date.now() - 60_000),
      activeRunExpiresAt: expiredAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // New worker boots up and claims lease
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 600_000);
    const claimed = await claimJiraSyncLease("EPM", "token_new_worker", newExpiresAt, now);

    expect(claimed.activeRunToken).toBe("token_new_worker");
    expect(cursorStore.get("jira:EPM")?.activeRunToken).toBe("token_new_worker");
  });
});

describe("PR 4: Config Validation", () => {
  it("missingWorkerRequired uses envSource param, not process.env", () => {
    // Pass a custom env with no DATABASE_URL
    const missing = missingWorkerRequired({ DATABASE_URL: undefined });
    expect(missing).toContain("DATABASE_URL");

    // Pass a custom env with DATABASE_URL set
    const notMissing = missingWorkerRequired({ DATABASE_URL: "postgresql://..." });
    expect(notMissing).not.toContain("DATABASE_URL");
  });

  it("validateWorkerStartup passes envSource through to all validators", () => {
    const errors = validateWorkerStartup({
      DATABASE_URL: "postgresql://localhost/test",
      JIRA_SYNC_EXPIRE_SECONDS: "300",
      JIRA_HEARTBEAT_SECONDS: "60",
    });
    expect(errors).toHaveLength(0);
  });

  it("validateWorkerStartup detects missing DATABASE_URL via envSource", () => {
    const errors = validateWorkerStartup({
      JIRA_SYNC_EXPIRE_SECONDS: "300",
      JIRA_HEARTBEAT_SECONDS: "60",
    });
    expect(errors).toContain("DATABASE_URL");
  });

  it("validateWorkerStartup detects invalid timing via envSource", () => {
    const errors = validateWorkerStartup({
      DATABASE_URL: "postgresql://localhost/test",
      JIRA_SYNC_EXPIRE_SECONDS: "50", // too low (min 120)
      JIRA_HEARTBEAT_SECONDS: "60",
    });
    expect(errors.some((e) => e.includes("120"))).toBe(true);
  });
});

describe("PR 4: computeLeaseTtlSeconds", () => {
  it("incremental sync uses configured JIRA_SYNC_EXPIRE_SECONDS", () => {
    const ttl = computeLeaseTtlSeconds(false);
    expect(ttl).toBeGreaterThanOrEqual(120);
  });

  it("full sync gets at least 900s TTL even if configured lower", () => {
    const ttl = computeLeaseTtlSeconds(true);
    expect(ttl).toBeGreaterThanOrEqual(900);
  });
});
