import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export type LinkServiceResult = {
  ok: boolean;
  branch?: unknown;
  error?: string;
};

/**
 * Confirm a suggested Jira link for a branch.
 * Changes linkState to 'confirmed', moves suggestedJiraKey -> jiraKey, sets linkSource = 'manual', confidence = 100.
 */
export async function confirmBranchLink(
  branchId: string,
  actorId: string,
  actorEmail?: string,
  reason?: string
): Promise<LinkServiceResult> {
  const branch = await prisma.branchInfo.findUnique({ where: { id: branchId } });
  if (!branch) return { ok: false, error: "Branch not found" };

  const targetKey = branch.suggestedJiraKey;
  if (!targetKey) {
    return { ok: false, error: "Branch has no suggested Jira key to confirm" };
  }

  const issue = await prisma.issueCache.findUnique({ where: { jiraKey: targetKey } });
  if (!issue) {
    return { ok: false, error: `Issue "${targetKey}" not found in Jira cache` };
  }

  const before = {
    jiraKey: branch.jiraKey,
    suggestedJiraKey: branch.suggestedJiraKey,
    linkState: branch.linkState,
    linkSource: branch.linkSource,
    linkConfidence: branch.linkConfidence,
  };

  const updated = await prisma.branchInfo.update({
    where: { id: branchId },
    data: {
      jiraKey: targetKey,
      suggestedJiraKey: null,
      linkState: "confirmed",
      linkSource: "manual",
      linkConfidence: 100,
      linkReason: reason ?? "Confirmed from suggestion",
      linkReviewedAt: new Date(),
      linkReviewedById: actorId,
    },
    include: {
      issue: {
        select: {
          jiraKey: true,
          summary: true,
          status: true,
          statusCategory: true,
          assigneeJira: true,
          priority: true,
          points: true,
          dueDate: true,
        },
      },
    },
  });

  const after = {
    jiraKey: updated.jiraKey,
    suggestedJiraKey: updated.suggestedJiraKey,
    linkState: updated.linkState,
    linkSource: updated.linkSource,
    linkConfidence: updated.linkConfidence,
    reason,
  };

  await audit({
    actorId,
    actorEmail,
    action: "branch.confirm_link",
    source: "web",
    target: `${branch.repo}:${branch.branch}`,
    before,
    after,
  });

  return { ok: true, branch: updated };
}

/**
 * Reject a suggested Jira link for a branch.
 * Sets linkState to 'rejected', clears suggestedJiraKey, records reviewer and reason.
 * The auto-sync worker will respect 'rejected' and will not re-suggest it.
 */
export async function rejectBranchSuggestion(
  branchId: string,
  actorId: string,
  actorEmail?: string,
  reason?: string
): Promise<LinkServiceResult> {
  const branch = await prisma.branchInfo.findUnique({ where: { id: branchId } });
  if (!branch) return { ok: false, error: "Branch not found" };

  const before = {
    jiraKey: branch.jiraKey,
    suggestedJiraKey: branch.suggestedJiraKey,
    linkState: branch.linkState,
    linkSource: branch.linkSource,
    linkConfidence: branch.linkConfidence,
  };

  const updated = await prisma.branchInfo.update({
    where: { id: branchId },
    data: {
      suggestedJiraKey: null,
      linkState: "rejected",
      linkReason: reason ?? "Suggestion rejected by user",
      linkReviewedAt: new Date(),
      linkReviewedById: actorId,
    },
  });

  const after = {
    jiraKey: updated.jiraKey,
    suggestedJiraKey: updated.suggestedJiraKey,
    linkState: updated.linkState,
    reason,
  };

  await audit({
    actorId,
    actorEmail,
    action: "branch.reject_suggestion",
    source: "web",
    target: `${branch.repo}:${branch.branch}`,
    before,
    after,
  });

  return { ok: true, branch: updated };
}

/**
 * Manually link or relink a branch to a specific Jira task.
 */
export async function manualRelinkBranch(
  branchId: string,
  targetJiraKey: string,
  actorId: string,
  actorEmail?: string,
  reason?: string
): Promise<LinkServiceResult> {
  const branch = await prisma.branchInfo.findUnique({ where: { id: branchId } });
  if (!branch) return { ok: false, error: "Branch not found" };

  const normalizedKey = targetJiraKey.trim().toUpperCase();
  const issue = await prisma.issueCache.findUnique({ where: { jiraKey: normalizedKey } });
  if (!issue) {
    return {
      ok: false,
      error: `Issue "${normalizedKey}" not found in Jira cache. Please verify key or sync issues.`,
    };
  }

  const before = {
    jiraKey: branch.jiraKey,
    suggestedJiraKey: branch.suggestedJiraKey,
    linkState: branch.linkState,
    linkSource: branch.linkSource,
    linkConfidence: branch.linkConfidence,
  };

  const updated = await prisma.branchInfo.update({
    where: { id: branchId },
    data: {
      jiraKey: normalizedKey,
      suggestedJiraKey: null,
      linkState: "confirmed",
      linkSource: "manual",
      linkConfidence: 100,
      linkReason: reason ?? "Manually linked",
      linkReviewedAt: new Date(),
      linkReviewedById: actorId,
    },
    include: {
      issue: {
        select: {
          jiraKey: true,
          summary: true,
          status: true,
          statusCategory: true,
          assigneeJira: true,
          priority: true,
          points: true,
          dueDate: true,
        },
      },
    },
  });

  const after = {
    jiraKey: updated.jiraKey,
    suggestedJiraKey: updated.suggestedJiraKey,
    linkState: updated.linkState,
    linkSource: updated.linkSource,
    linkConfidence: updated.linkConfidence,
    reason,
  };

  await audit({
    actorId,
    actorEmail,
    action: "branch.link",
    source: "web",
    target: `${branch.repo}:${branch.branch}`,
    before,
    after,
  });

  return { ok: true, branch: updated };
}

/**
 * Manually unlink a branch.
 * Sets jiraKey = null, linkState = 'manual_unlinked'.
 * This prevents the branch from being automatically re-linked on subsequent Bitbucket syncs!
 */
export async function manualUnlinkBranch(
  branchId: string,
  actorId: string,
  actorEmail?: string,
  reason?: string
): Promise<LinkServiceResult> {
  const branch = await prisma.branchInfo.findUnique({ where: { id: branchId } });
  if (!branch) return { ok: false, error: "Branch not found" };

  const before = {
    jiraKey: branch.jiraKey,
    suggestedJiraKey: branch.suggestedJiraKey,
    linkState: branch.linkState,
    linkSource: branch.linkSource,
    linkConfidence: branch.linkConfidence,
  };

  const updated = await prisma.branchInfo.update({
    where: { id: branchId },
    data: {
      jiraKey: null,
      suggestedJiraKey: null,
      linkState: "manual_unlinked",
      linkSource: "manual",
      linkConfidence: 0,
      linkReason: reason ?? "Manually unlinked by user",
      linkReviewedAt: new Date(),
      linkReviewedById: actorId,
    },
  });

  const after = {
    jiraKey: null,
    suggestedJiraKey: null,
    linkState: updated.linkState,
    linkSource: updated.linkSource,
    reason,
  };

  await audit({
    actorId,
    actorEmail,
    action: "branch.unlink",
    source: "web",
    target: `${branch.repo}:${branch.branch}`,
    before,
    after,
  });

  return { ok: true, branch: updated };
}

/**
 * Record an explicit branch link created via system actions (e.g. bulk branch creation).
 * linkSource = 'explicit', linkConfidence = 100, linkState = 'confirmed'.
 */
export async function recordExplicitBranchLink(
  repo: string,
  branch: string,
  jiraKey: string
): Promise<void> {
  try {
    const normalizedKey = jiraKey.trim().toUpperCase();
    await prisma.branchInfo.upsert({
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
  } catch {
    // Best-effort non-blocking
  }
}
