import { prisma } from "@/lib/prisma";
import { upsertBranchLink, recomputePrimaryLink } from "./branch-links";
import {
  isProtectedBranchLinkState,
  type DiscoveredLink,
} from "./link-discovery";

export type ReconcileBranchDiscoveryResult = {
  reconciledCount: number;
  primaryKey: string | null;
};

/**
 * Reconcile discovered candidate links for a branch into BranchIssueLink and update the primary link on BranchInfo.
 * If the branch has a protected state ('manual_unlinked' or 'rejected'), automatic reconciliation is skipped.
 */
export async function reconcileDiscoveredBranchLinks(
  branchId: string,
  candidates: DiscoveredLink[],
  opts: { branchLinkState?: string | null; force?: boolean } = {}
): Promise<ReconcileBranchDiscoveryResult> {
  if (!opts.force && isProtectedBranchLinkState(opts.branchLinkState)) {
    return { reconciledCount: 0, primaryKey: null };
  }

  let reconciledCount = 0;
  for (const candidate of candidates) {
    const res = await upsertBranchLink(
      branchId,
      candidate.jiraKey,
      {
        source: candidate.source,
        confidence: candidate.confidence,
        reason: candidate.reason,
      },
      { force: opts.force }
    );
    if (res.changed) reconciledCount++;
  }

  const primaryKey = await recomputePrimaryLink(branchId);
  return { reconciledCount, primaryKey };
}

/**
 * Record an explicit branch link created via user/system actions (e.g. bulk branch creation).
 * Sets linkSource = 'explicit', linkConfidence = 100, linkState = 'confirmed'.
 */
export async function reconcileExplicitBranchLink(
  repo: string,
  branch: string,
  jiraKey: string
): Promise<void> {
  try {
    const normalizedKey = jiraKey.trim().toUpperCase();
    const row = await prisma.branchInfo.upsert({
      where: { repo_branch: { repo, branch } },
      create: {
        repo,
        branch,
        jiraKey: normalizedKey,
        linkSource: "explicit",
        linkConfidence: 100,
        linkState: "confirmed",
        checkedAt: new Date(),
      },
      update: {
        jiraKey: normalizedKey,
        linkSource: "explicit",
        linkConfidence: 100,
        linkState: "confirmed",
        suggestedJiraKey: null,
      },
    });
    await upsertBranchLink(
      row.id,
      normalizedKey,
      { source: "explicit", confidence: 100, reason: "Branch created from task" },
      { force: true }
    );
  } catch {
    // Best-effort non-blocking
  }
}

/**
 * Clean up comment placeholder records once a real Bitbucket branch is discovered.
 */
export async function reconcileCommentPlaceholders(
  realBranchName: string,
  validKeys?: Set<string>
): Promise<{ deletedIds: string[]; hintKey: string | null }> {
  const placeholders = await prisma.branchInfo.findMany({
    where: { branch: realBranchName, repo: { startsWith: "jira-comment:" }, deletedAt: null },
    select: { id: true, suggestedJiraKey: true },
  });

  if (placeholders.length === 0) {
    return { deletedIds: [], hintKey: null };
  }

  const hint = placeholders.find(
    (p) => p.suggestedJiraKey && (!validKeys || validKeys.has(p.suggestedJiraKey))
  );

  const deletedIds = placeholders.map((p) => p.id);
  await prisma.branchInfo.updateMany({
    where: { id: { in: deletedIds } },
    data: { deletedAt: new Date() },
  });

  return { deletedIds, hintKey: hint?.suggestedJiraKey ?? null };
}
