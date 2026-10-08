import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Branch ↔ Jira task links (many-to-many).
 *
 * `BranchIssueLink` is the source of truth for "which branches does task X have".
 * `BranchInfo.jiraKey` is kept as a denormalised *primary* task for the
 * branch-centric screens; `recomputePrimaryLink` keeps it in sync.
 */

const MANUAL_SOURCES = new Set(["manual", "explicit"]);

export type LinkWrite = {
  source: string;
  confidence: number;
  reason?: string | null;
  actorId?: string | null;
};

/** Relation filter: a task's confirmed links to live branches matching `branch`. */
export function confirmedBranchLinkFilter(
  branch: Prisma.BranchInfoWhereInput = {}
): Prisma.IssueCacheWhereInput {
  return {
    branchLinks: {
      some: { linkState: "confirmed", branch: { deletedAt: null, ...branch } },
    },
  };
}

/** Include clause that loads a task's confirmed, live branches. */
export const confirmedBranchLinksInclude = {
  where: { linkState: "confirmed", branch: { deletedAt: null } },
  include: { branch: true },
  orderBy: { branch: { checkedAt: "desc" } },
} satisfies Prisma.IssueCache$branchLinksArgs;

/**
 * Add (or revive) a link between a branch and a task.
 * Auto sources never override a per-pair decision to unlink/reject; a user
 * action (`force`) always wins.
 */
export async function upsertBranchLink(
  branchId: string,
  jiraKey: string,
  write: LinkWrite,
  opts: { force?: boolean } = {}
): Promise<{ changed: boolean }> {
  const existing = await prisma.branchIssueLink.findUnique({
    where: { branchId_jiraKey: { branchId, jiraKey } },
  });

  if (existing && !opts.force && existing.linkState !== "confirmed") {
    return { changed: false };
  }

  if (existing?.linkState === "confirmed" && !opts.force) {
    // Never downgrade a manual/explicit link with an automatic source.
    if (MANUAL_SOURCES.has(existing.linkSource ?? "")) return { changed: false };
    if (existing.linkSource === write.source && existing.linkConfidence === write.confidence) {
      return { changed: false };
    }
  }

  const data = {
    linkSource: write.source,
    linkConfidence: write.confidence,
    linkState: "confirmed",
    linkReason: write.reason ?? null,
    linkReviewedAt: write.actorId ? new Date() : null,
    linkReviewedById: write.actorId ?? null,
  };

  await prisma.branchIssueLink.upsert({
    where: { branchId_jiraKey: { branchId, jiraKey } },
    create: { branchId, jiraKey, ...data },
    update: data,
  });
  return { changed: true };
}

/** Mark one branch↔task pair as unlinked/rejected so auto-sync won't re-add it. */
export async function markBranchLinkRemoved(
  branchId: string,
  jiraKey: string,
  state: "manual_unlinked" | "rejected",
  actorId?: string | null,
  reason?: string | null
): Promise<void> {
  const data = {
    linkSource: "manual",
    linkConfidence: 0,
    linkState: state,
    linkReason: reason ?? null,
    linkReviewedAt: new Date(),
    linkReviewedById: actorId ?? null,
  };
  await prisma.branchIssueLink.upsert({
    where: { branchId_jiraKey: { branchId, jiraKey } },
    create: { branchId, jiraKey, ...data },
    update: data,
  });
}

/**
 * Re-derive `BranchInfo.jiraKey` (+ link metadata) from the confirmed links.
 * Preference: manual/explicit, then highest confidence, then oldest.
 */
export async function recomputePrimaryLink(branchId: string): Promise<string | null> {
  const [branch, links] = await Promise.all([
    prisma.branchInfo.findUnique({
      where: { id: branchId },
      select: { jiraKey: true, linkState: true },
    }),
    prisma.branchIssueLink.findMany({
      where: { branchId, linkState: "confirmed" },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!branch) return null;

  const ranked = [...links].sort((a, b) => {
    const am = MANUAL_SOURCES.has(a.linkSource ?? "") ? 1 : 0;
    const bm = MANUAL_SOURCES.has(b.linkSource ?? "") ? 1 : 0;
    if (am !== bm) return bm - am;
    return (b.linkConfidence ?? 0) - (a.linkConfidence ?? 0);
  });
  // Keep the current primary when it is still a top-ranked confirmed link (stability).
  const current = ranked.find((l) => l.jiraKey === branch.jiraKey);
  const primary = current ?? ranked[0];

  if (!primary) {
    if (branch.jiraKey) {
      await prisma.branchInfo.update({
        where: { id: branchId },
        data: {
          jiraKey: null,
          linkSource: null,
          linkConfidence: null,
          linkState: branch.linkState === "confirmed" ? "unlinked" : branch.linkState,
        },
      });
    }
    return null;
  }

  if (branch.jiraKey !== primary.jiraKey || branch.linkState !== "confirmed") {
    await prisma.branchInfo.update({
      where: { id: branchId },
      data: {
        jiraKey: primary.jiraKey,
        suggestedJiraKey: null,
        linkSource: primary.linkSource,
        linkConfidence: primary.linkConfidence,
        linkState: "confirmed",
      },
    });
  }
  return primary.jiraKey;
}

/** All confirmed task keys for a set of branches (for display next to a branch). */
export async function confirmedKeysByBranch(branchIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (branchIds.length === 0) return map;
  const rows = await prisma.branchIssueLink.findMany({
    where: { branchId: { in: branchIds }, linkState: "confirmed" },
    select: { branchId: true, jiraKey: true },
    orderBy: { createdAt: "asc" },
  });
  for (const r of rows) {
    const list = map.get(r.branchId) ?? [];
    list.push(r.jiraKey);
    map.set(r.branchId, list);
  }
  return map;
}

/**
 * Live branches confirmed-linked to any of `jiraKeys`, one row per (task, branch)
 * pair — a branch shared by two tasks appears once for each.
 */
export async function loadConfirmedBranchRows(jiraKeys: string[]) {
  if (jiraKeys.length === 0) return [];
  const links = await prisma.branchIssueLink.findMany({
    where: { jiraKey: { in: jiraKeys }, linkState: "confirmed", branch: { deletedAt: null } },
    select: {
      jiraKey: true,
      linkState: true,
      branch: {
        select: {
          repo: true,
          branch: true,
          prId: true,
          prTitle: true,
          prUrl: true,
          prState: true,
          prDestinationBranch: true,
          merged: true,
          checkedAt: true,
          deletedAt: true,
        },
      },
    },
  });
  return links.map((l) => ({ jiraKey: l.jiraKey, linkState: l.linkState, ...l.branch }));
}
