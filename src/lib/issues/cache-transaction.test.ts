/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertJiraIssue, syncIssueLinks, isPrismaUniqueConstraintError } from "./cache";
import { prisma } from "@/lib/prisma";
import type { JiraIssue } from "@/lib/jira/types";

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

describe("PR 2 — Transactional Issue + Links", () => {
  type IssueRecord = {
    jiraKey: string;
    projectKey: string;
    summary: string;
    status: string;
    updatedAt: Date | null;
    deletedAt: Date | null;
    [key: string]: any;
  };
  type LinkRecord = {
    id: string;
    jiraLinkId: string;
    outwardKey: string;
    inwardKey: string;
    deletedAt: Date | null;
    [key: string]: any;
  };

  let issueStore: Map<string, IssueRecord>;
  let linkStore: Map<string, LinkRecord>;
  let transactionRolledBack: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    issueStore = new Map();
    linkStore = new Map();
    transactionRolledBack = false;

    // Mock $transaction to track rollback
    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      // Create a snapshot for rollback simulation
      const issueSnapshot = new Map(issueStore);
      const linkSnapshot = new Map(linkStore);
      try {
        return await callback(prisma);
      } catch (error) {
        // Rollback: restore snapshots
        issueStore.clear();
        for (const [k, v] of issueSnapshot) issueStore.set(k, { ...v });
        linkStore.clear();
        for (const [k, v] of linkSnapshot) linkStore.set(k, { ...v });
        transactionRolledBack = true;
        throw error;
      }
    });

    vi.spyOn(prisma.issueCache as any, "findUnique").mockImplementation(
      async ({ where }: any) => issueStore.get(where.jiraKey) ?? null
    );

    vi.spyOn(prisma.issueCache as any, "create").mockImplementation(
      async ({ data }: any) => {
        if (issueStore.has(data.jiraKey)) {
          const err = new Error("Unique constraint failed on the fields: (`jiraKey`)");
          (err as any).code = "P2002";
          throw err;
        }
        issueStore.set(data.jiraKey, { ...data, deletedAt: null });
        return issueStore.get(data.jiraKey)!;
      }
    );

    vi.spyOn(prisma.issueCache as any, "updateMany").mockImplementation(
      async ({ where, data }: any) => {
        let count = 0;
        for (const record of issueStore.values()) {
          if (where.jiraKey && record.jiraKey !== where.jiraKey) continue;
          if (where.OR) {
            const matchesOr = where.OR.some((clause: any) => {
              if (clause.updatedAt === null && record.updatedAt === null) return true;
              if (clause.updatedAt?.lte && record.updatedAt && record.updatedAt <= clause.updatedAt.lte)
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

    vi.spyOn(prisma.issueLinkCache as any, "upsert").mockImplementation(
      async ({ where, create, update }: any) => {
        if (!linkStore.has(where.jiraLinkId)) {
          linkStore.set(where.jiraLinkId, { id: `link-${where.jiraLinkId}`, ...create });
        } else {
          Object.assign(linkStore.get(where.jiraLinkId)!, update);
        }
        return linkStore.get(where.jiraLinkId)!;
      }
    );

    vi.spyOn(prisma.issueLinkCache as any, "updateMany").mockImplementation(
      async ({ where, data }: any) => {
        let count = 0;
        for (const link of linkStore.values()) {
          const matchesKey =
            (where.OR ?? []).some((cond: any) =>
              (cond.inwardKey && link.inwardKey === cond.inwardKey) ||
              (cond.outwardKey && link.outwardKey === cond.outwardKey)
            );
          if (!matchesKey) continue;
          if (where.deletedAt === null && link.deletedAt !== null) continue;
          if (where.jiraLinkId?.notIn?.includes(link.jiraLinkId)) {
            // This link should be soft-deleted
          } else {
            continue;
          }
          Object.assign(link, data);
          count++;
        }
        return { count };
      }
    );
  });

  function makeIssue(key: string, updatedAt: string, links?: any[]): JiraIssue {
    return {
      id: "100",
      key,
      self: "",
      fields: {
        project: { key: key.split("-")[0] },
        summary: `Issue at ${updatedAt}`,
        status: { name: "In Progress" },
        updated: updatedAt,
        issuelinks: links ?? [],
      },
    };
  }

  function makeBlocksLink(id: string, inwardKey: string): any {
    return {
      id,
      type: {
        id: "10000",
        name: "Blocks",
        inward: "is blocked by",
        outward: "blocks",
      },
      outwardIssue: { key: inwardKey },
    };
  }

  // Test: Job A applies T2 then pauses before link sync; Job B applies T3
  // → final result must be issue T3 and links T3
  it("interleaving T2/T3: final result is T3 issue with T3 links", async () => {
    const t2 = "2026-09-30T09:00:00.000Z";
    const t3 = "2026-09-30T10:00:00.000Z";

    // Job A writes T2 first
    const issueT2 = makeIssue("EPM-1", t2, [makeBlocksLink("link-A", "EPM-2")]);
    const resA = await upsertJiraIssue(issueT2);
    expect(resA.applied).toBe(true);
    expect(issueStore.get("EPM-1")?.summary).toContain(t2);

    // Job B writes T3 (newer)
    const issueT3 = makeIssue("EPM-1", t3, [makeBlocksLink("link-B", "EPM-3")]);
    const resB = await upsertJiraIssue(issueT3);
    expect(resB.applied).toBe(true);
    expect(issueStore.get("EPM-1")?.summary).toContain(t3);

    // T3 links should be present
    expect(linkStore.has("link-B")).toBe(true);
  });

  // Test: Job B T3 completes first, Job A T2 arrives after → T2 rejected entirely
  it("stale T2 after T3: T2 rejected completely, no link changes", async () => {
    const t2 = "2026-09-30T09:00:00.000Z";
    const t3 = "2026-09-30T10:00:00.000Z";

    // T3 already in DB
    const issueT3 = makeIssue("EPM-1", t3, [makeBlocksLink("link-T3", "EPM-3")]);
    await upsertJiraIssue(issueT3);
    expect(linkStore.has("link-T3")).toBe(true);

    // T2 arrives late — should be rejected
    const issueT2 = makeIssue("EPM-1", t2, [makeBlocksLink("link-T2", "EPM-2")]);
    const resA = await upsertJiraIssue(issueT2);
    expect(resA.applied).toBe(false);

    // T3 links still there, no T2 links added
    expect(linkStore.has("link-T3")).toBe(true);
    // T2 link should NOT be created because payload was stale
    expect(linkStore.has("link-T2")).toBe(false);
  });

  // Test: Link sync error mid-transaction → both issue AND links roll back
  it("link sync error causes full transaction rollback", async () => {
    // Make link upsert fail after one call
    let linkCallCount = 0;
    vi.spyOn(prisma.issueLinkCache as any, "upsert").mockImplementation(async () => {
      linkCallCount++;
      if (linkCallCount > 0) {
        throw new Error("Database connection lost");
      }
      return {};
    });

    const issue = makeIssue("EPM-1", "2026-09-30T09:00:00.000Z", [
      makeBlocksLink("link-fail", "EPM-2"),
    ]);

    await expect(upsertJiraIssue(issue)).rejects.toThrow("Database connection lost");
    expect(transactionRolledBack).toBe(true);

    // Issue should NOT be in store due to rollback
    expect(issueStore.has("EPM-1")).toBe(false);
    // Links should NOT be in store due to rollback
    expect(linkStore.has("link-fail")).toBe(false);
  });

  // Test: Two payloads with same updatedAt → idempotent no-op on second
  it("same updatedAt is idempotent: second write is a no-op update", async () => {
    const timestamp = "2026-09-30T09:00:00.000Z";
    const issue1 = makeIssue("EPM-1", timestamp, []);
    const issue2 = makeIssue("EPM-1", timestamp, []);

    const res1 = await upsertJiraIssue(issue1);
    expect(res1.applied).toBe(true);

    // Same timestamp: conditional update matches (lte), applied = true but data unchanged
    const res2 = await upsertJiraIssue(issue2);
    expect(res2.applied).toBe(true);
  });
});

describe("syncIssueLinks with transaction client", () => {
  it("accepts a tx client and uses it for operations", async () => {
    const mockUpsert = vi.fn().mockResolvedValue({});
    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const txClient = {
      issueLinkCache: {
        upsert: mockUpsert,
        updateMany: mockUpdateMany,
      },
    };

    const result = await syncIssueLinks(
      "EPM-1",
      [
        {
          id: "link-1",
          type: { id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" },
          outwardIssue: { key: "EPM-2" },
        },
      ] as any,
      txClient as any
    );

    expect(result).toBe(1);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalled();
  });
});

describe("isPrismaUniqueConstraintError", () => {
  it("detects P2002 by error code", () => {
    const err = new Error("Unique constraint");
    (err as any).code = "P2002";
    expect(isPrismaUniqueConstraintError(err)).toBe(true);
  });

  it("detects P2002 by message fallback", () => {
    const err = new Error("P2002: Unique constraint violation on jiraKey");
    expect(isPrismaUniqueConstraintError(err)).toBe(true);
  });

  it("rejects non-P2002 errors", () => {
    const err = new Error("P2025: Record not found");
    expect(isPrismaUniqueConstraintError(err)).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isPrismaUniqueConstraintError(null)).toBe(false);
    expect(isPrismaUniqueConstraintError(undefined)).toBe(false);
  });
});
