import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  branches: [] as Record<string, unknown>[],
  links: [] as Record<string, unknown>[],
  placeholders: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    branchInfo: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; repo_branch?: { repo: string; branch: string } } }) => {
        if (where.id) return db.branches.find((b) => b.id === where.id) ?? null;
        if (where.repo_branch) {
          return (
            db.branches.find(
              (b) => b.repo === where.repo_branch?.repo && b.branch === where.repo_branch?.branch
            ) ?? null
          );
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where: { branch?: string; repo?: { startsWith?: string }; deletedAt?: null } }) => {
        return db.placeholders.filter((p) => {
          if (where.branch && p.branch !== where.branch) return false;
          if (where.repo?.startsWith && !String(p.repo).startsWith(where.repo.startsWith)) return false;
          if (where.deletedAt === null && p.deletedAt !== null) return false;
          return true;
        });
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { repo_branch: { repo: string; branch: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        let existing = db.branches.find(
          (b) => b.repo === where.repo_branch.repo && b.branch === where.repo_branch.branch
        );
        if (existing) {
          Object.assign(existing, update);
        } else {
          existing = { id: `branch-${db.branches.length + 1}`, ...create };
          db.branches.push(existing);
        }
        return existing;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const item = db.branches.find((b) => b.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Record<string, unknown> }) => {
        let count = 0;
        for (const p of db.placeholders) {
          if (where.id.in.includes(p.id as string)) {
            Object.assign(p, data);
            count++;
          }
        }
        return { count };
      }),
    },
    branchIssueLink: {
      findUnique: vi.fn(async ({ where }: { where: { branchId_jiraKey: { branchId: string; jiraKey: string } } }) => {
        return (
          db.links.find(
            (l) => l.branchId === where.branchId_jiraKey.branchId && l.jiraKey === where.branchId_jiraKey.jiraKey
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: { branchId: string; linkState?: string } }) => {
        return db.links.filter(
          (l) => l.branchId === where.branchId && (!where.linkState || l.linkState === where.linkState)
        );
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { branchId_jiraKey: { branchId: string; jiraKey: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        let existing = db.links.find(
          (l) => l.branchId === where.branchId_jiraKey.branchId && l.jiraKey === where.branchId_jiraKey.jiraKey
        );
        if (existing) {
          Object.assign(existing, update);
        } else {
          existing = { ...create, createdAt: new Date() };
          db.links.push(existing);
        }
        return existing;
      }),
    },
  },
}));

import {
  reconcileDiscoveredBranchLinks,
  reconcileExplicitBranchLink,
  reconcileCommentPlaceholders,
} from "./link-reconciliation";

describe("link-reconciliation: reconcileDiscoveredBranchLinks", () => {
  beforeEach(() => {
    db.branches.length = 0;
    db.links.length = 0;
    db.placeholders.length = 0;
  });

  it("skips auto-reconciliation if branch is manual_unlinked", async () => {
    db.branches.push({ id: "b1", jiraKey: null, linkState: "manual_unlinked" });
    const res = await reconcileDiscoveredBranchLinks(
      "b1",
      [{ jiraKey: "EPM-1", source: "branch_name", confidence: 95 }],
      { branchLinkState: "manual_unlinked" }
    );
    expect(res).toEqual({ reconciledCount: 0, primaryKey: null });
    expect(db.links).toHaveLength(0);
  });

  it("skips auto-reconciliation if branch is rejected", async () => {
    db.branches.push({ id: "b1", jiraKey: null, linkState: "rejected" });
    const res = await reconcileDiscoveredBranchLinks(
      "b1",
      [{ jiraKey: "EPM-1", source: "branch_name", confidence: 95 }],
      { branchLinkState: "rejected" }
    );
    expect(res).toEqual({ reconciledCount: 0, primaryKey: null });
    expect(db.links).toHaveLength(0);
  });

  it("reconciles candidates and updates primary key", async () => {
    db.branches.push({ id: "b1", jiraKey: null, linkState: "unlinked" });
    const res = await reconcileDiscoveredBranchLinks("b1", [
      { jiraKey: "EPM-10", source: "branch_name", confidence: 95 },
      { jiraKey: "EPM-20", source: "pr_title", confidence: 85 },
    ]);
    expect(res.reconciledCount).toBe(2);
    expect(res.primaryKey).toBe("EPM-10");
    expect(db.links).toHaveLength(2);
    expect(db.branches[0].jiraKey).toBe("EPM-10");
    expect(db.branches[0].linkState).toBe("confirmed");
  });

  it("forces link reconciliation when force option is passed even if unlinked", async () => {
    db.branches.push({ id: "b1", jiraKey: null, linkState: "manual_unlinked" });
    const res = await reconcileDiscoveredBranchLinks(
      "b1",
      [{ jiraKey: "EPM-1", source: "manual", confidence: 100 }],
      { branchLinkState: "manual_unlinked", force: true }
    );
    expect(res.reconciledCount).toBe(1);
    expect(res.primaryKey).toBe("EPM-1");
    expect(db.links).toHaveLength(1);
  });
});

describe("link-reconciliation: reconcileExplicitBranchLink", () => {
  beforeEach(() => {
    db.branches.length = 0;
    db.links.length = 0;
    db.placeholders.length = 0;
  });

  it("creates explicit branch and confirmed link with confidence 100", async () => {
    await reconcileExplicitBranchLink("Softdreams/core", "feature/EPM-999-task", "epm-999");
    expect(db.branches).toHaveLength(1);
    expect(db.branches[0]).toMatchObject({
      repo: "Softdreams/core",
      branch: "feature/EPM-999-task",
      jiraKey: "EPM-999",
      linkSource: "explicit",
      linkConfidence: 100,
      linkState: "confirmed",
    });
    expect(db.links).toHaveLength(1);
    expect(db.links[0]).toMatchObject({
      jiraKey: "EPM-999",
      linkSource: "explicit",
      linkConfidence: 100,
      linkState: "confirmed",
    });
  });

  it("handles empty / error silently without throwing", async () => {
    // Should not throw even if something unexpected happens
    await expect(reconcileExplicitBranchLink("", "", "")).resolves.toBeUndefined();
  });
});

describe("link-reconciliation: reconcileCommentPlaceholders", () => {
  beforeEach(() => {
    db.branches.length = 0;
    db.links.length = 0;
    db.placeholders.length = 0;
  });

  it("returns empty when no placeholders exist", async () => {
    const res = await reconcileCommentPlaceholders("feature/test", new Set(["EPM-1"]));
    expect(res).toEqual({ deletedIds: [], hintKey: null });
  });

  it("deletes placeholder records and extracts valid hintKey", async () => {
    db.placeholders.push({
      id: "ph-1",
      repo: "jira-comment:EPM",
      branch: "feature/test",
      suggestedJiraKey: "EPM-100",
      deletedAt: null,
    });
    const res = await reconcileCommentPlaceholders("feature/test", new Set(["EPM-100"]));
    expect(res.deletedIds).toEqual(["ph-1"]);
    expect(res.hintKey).toBe("EPM-100");
    expect(db.placeholders[0].deletedAt).toBeInstanceOf(Date);
  });

  it("ignores hintKey if not in validKeys", async () => {
    db.placeholders.push({
      id: "ph-2",
      repo: "jira-comment:EPM",
      branch: "feature/test2",
      suggestedJiraKey: "EPM-999",
      deletedAt: null,
    });
    const res = await reconcileCommentPlaceholders("feature/test2", new Set(["EPM-100"]));
    expect(res.deletedIds).toEqual(["ph-2"]);
    expect(res.hintKey).toBeNull();
  });
});
