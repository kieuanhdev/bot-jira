import { beforeEach, describe, expect, it, vi } from "vitest";

type Link = {
  branchId: string;
  jiraKey: string;
  linkSource: string | null;
  linkConfidence: number | null;
  linkState: string;
  createdAt: Date;
};

const db = vi.hoisted(() => ({
  links: [] as Link[],
  branch: { jiraKey: null as string | null, linkState: "unlinked" },
  branchUpdates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    branchIssueLink: {
      findUnique: vi.fn(async ({ where }: { where: { branchId_jiraKey: { branchId: string; jiraKey: string } } }) =>
        db.links.find(
          (l) => l.branchId === where.branchId_jiraKey.branchId && l.jiraKey === where.branchId_jiraKey.jiraKey
        ) ?? null
      ),
      findMany: vi.fn(async ({ where }: { where: { branchId: string; linkState: string } }) =>
        db.links.filter((l) => l.branchId === where.branchId && l.linkState === where.linkState)
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { branchId_jiraKey: { branchId: string; jiraKey: string } };
          create: Omit<Link, "createdAt">;
          update: Partial<Link>;
        }) => {
          const k = where.branchId_jiraKey;
          const existing = db.links.find((l) => l.branchId === k.branchId && l.jiraKey === k.jiraKey);
          if (existing) Object.assign(existing, update);
          else db.links.push({ ...create, createdAt: new Date(db.links.length) } as Link);
        }
      ),
    },
    branchInfo: {
      findUnique: vi.fn(async () => ({ ...db.branch })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.branchUpdates.push(data);
        Object.assign(db.branch, data);
      }),
    },
  },
}));

import { markBranchLinkRemoved, recomputePrimaryLink, upsertBranchLink } from "./branch-links";

const auto = { source: "branch_name", confidence: 95 };

describe("branch ↔ task links", () => {
  beforeEach(() => {
    db.links.length = 0;
    db.branchUpdates.length = 0;
    db.branch.jiraKey = null;
    db.branch.linkState = "unlinked";
  });

  it("lets one branch link to several tasks", async () => {
    await upsertBranchLink("b1", "EPM-1", auto);
    await upsertBranchLink("b1", "EPM-2", { source: "pr_title", confidence: 85 });
    expect(db.links.map((l) => l.jiraKey)).toEqual(["EPM-1", "EPM-2"]);
  });

  it("auto sources never revive a pair the user unlinked or rejected", async () => {
    await markBranchLinkRemoved("b1", "EPM-1", "manual_unlinked", "u1");
    const res = await upsertBranchLink("b1", "EPM-1", auto);
    expect(res.changed).toBe(false);
    expect(db.links[0].linkState).toBe("manual_unlinked");
  });

  it("a user action can re-link a previously unlinked pair", async () => {
    await markBranchLinkRemoved("b1", "EPM-1", "manual_unlinked", "u1");
    await upsertBranchLink("b1", "EPM-1", { source: "manual", confidence: 100, actorId: "u1" }, { force: true });
    expect(db.links[0]).toMatchObject({ linkState: "confirmed", linkSource: "manual" });
  });

  it("does not downgrade a manual link with an automatic source", async () => {
    await upsertBranchLink("b1", "EPM-1", { source: "manual", confidence: 100, actorId: "u1" }, { force: true });
    const res = await upsertBranchLink("b1", "EPM-1", auto);
    expect(res.changed).toBe(false);
    expect(db.links[0].linkSource).toBe("manual");
  });

  it("unlinking one task leaves the other task's link untouched", async () => {
    await upsertBranchLink("b1", "EPM-1", auto);
    await upsertBranchLink("b1", "EPM-2", auto);
    await markBranchLinkRemoved("b1", "EPM-1", "manual_unlinked", "u1");
    expect(db.links.find((l) => l.jiraKey === "EPM-2")?.linkState).toBe("confirmed");
    expect(db.links.find((l) => l.jiraKey === "EPM-1")?.linkState).toBe("manual_unlinked");
  });

  describe("recomputePrimaryLink", () => {
    it("prefers a manual link over an automatic one", async () => {
      await upsertBranchLink("b1", "EPM-1", auto);
      await upsertBranchLink("b1", "EPM-2", { source: "manual", confidence: 100, actorId: "u1" }, { force: true });
      expect(await recomputePrimaryLink("b1")).toBe("EPM-2");
      expect(db.branch).toMatchObject({ jiraKey: "EPM-2", linkState: "confirmed" });
    });

    it("keeps the current primary while it is still confirmed", async () => {
      db.branch.jiraKey = "EPM-1";
      db.branch.linkState = "confirmed";
      await upsertBranchLink("b1", "EPM-1", auto);
      await upsertBranchLink("b1", "EPM-2", auto);
      expect(await recomputePrimaryLink("b1")).toBe("EPM-1");
    });

    it("moves the primary to a remaining link when the primary is unlinked", async () => {
      db.branch.jiraKey = "EPM-1";
      db.branch.linkState = "confirmed";
      await upsertBranchLink("b1", "EPM-1", auto);
      await upsertBranchLink("b1", "EPM-2", auto);
      await markBranchLinkRemoved("b1", "EPM-1", "manual_unlinked", "u1");
      expect(await recomputePrimaryLink("b1")).toBe("EPM-2");
      expect(db.branch.jiraKey).toBe("EPM-2");
    });

    it("clears the primary when no confirmed link remains", async () => {
      db.branch.jiraKey = "EPM-1";
      db.branch.linkState = "confirmed";
      await upsertBranchLink("b1", "EPM-1", auto);
      await markBranchLinkRemoved("b1", "EPM-1", "manual_unlinked", "u1");
      expect(await recomputePrimaryLink("b1")).toBeNull();
      expect(db.branch).toMatchObject({ jiraKey: null, linkState: "unlinked" });
    });
  });
});
