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

  // Ensure issue exists in IssueCache so foreign key is satisfied
  let issue = await prisma.issueCache.findUnique({ where: { jiraKey: targetKey } });
  if (!issue) {
    issue = await prisma.issueCache.create({
      data: {
        jiraKey: targetKey,
        projectKey: targetKey.split("-")[0] || "",
        summary: targetKey,
        status: "Unknown",
        statusCategory: "unknown",
        priority: "Medium",
        type: "Task",
        fixVersionIds: [],
        fixVersionNames: [],
        labels: [],
      },
    });
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

const JIRA_KEY_FORMAT = /^[A-Z][A-Z0-9]+-\d+$/;

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
  if (!JIRA_KEY_FORMAT.test(normalizedKey)) {
    return { ok: false, error: `Mã Jira "${normalizedKey}" không hợp lệ (ví dụ: EPM-3395)` };
  }
  const issue = await prisma.issueCache.findUnique({
    where: { jiraKey: normalizedKey },
    select: { jiraKey: true },
  });
  if (!issue) {
    return { ok: false, error: `Không tìm thấy task ${normalizedKey} trong bộ nhớ đệm Jira` };
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
 * Link several branches to the same Jira task. Continues past individual failures and
 * returns them so the UI can report them.
 */
export async function manualRelinkBranches(
  branchIds: string[],
  targetJiraKey: string,
  actorId: string,
  actorEmail?: string,
  reason?: string
): Promise<{ ok: true; count: number; failed: { id: string; error: string }[] } | { ok: false; error: string }> {
  const ids = Array.from(new Set(branchIds.filter((id) => typeof id === "string" && id)));
  if (ids.length === 0) return { ok: false, error: "Chưa chọn nhánh nào" };
  if (ids.length > 100) return { ok: false, error: "Chỉ gắn tối đa 100 nhánh mỗi lần" };

  let count = 0;
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    const res = await manualRelinkBranch(id, targetJiraKey, actorId, actorEmail, reason);
    if (res.ok) count++;
    else failed.push({ id, error: res.error ?? "Unknown error" });
  }
  if (count === 0) return { ok: false, error: failed[0]?.error ?? "Không gắn được nhánh nào" };
  return { ok: true, count, failed };
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

/**
 * Bulk confirm all pending branch suggestions in the database.
 */
export async function confirmAllBranchSuggestions(
  actorId: string,
  actorEmail?: string
): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const pendingBranches = await prisma.branchInfo.findMany({
      where: {
        deletedAt: null,
        jiraKey: null,
        suggestedJiraKey: { not: null },
        linkState: { notIn: ["rejected", "manual_unlinked"] },
      },
    });

    let confirmedCount = 0;
    for (const b of pendingBranches) {
      if (!b.suggestedJiraKey) continue;
      const targetKey = b.suggestedJiraKey.trim().toUpperCase();

      // Ensure IssueCache stub exists
      await prisma.issueCache.upsert({
        where: { jiraKey: targetKey },
        create: {
          jiraKey: targetKey,
          projectKey: targetKey.split("-")[0] || "",
          summary: targetKey,
          status: "Unknown",
          statusCategory: "unknown",
          priority: "Medium",
          type: "Task",
          fixVersionIds: [],
          fixVersionNames: [],
          labels: [],
        },
        update: {},
      });

      await prisma.branchInfo.update({
        where: { id: b.id },
        data: {
          jiraKey: targetKey,
          suggestedJiraKey: null,
          linkState: "confirmed",
          linkSource: b.linkSource ?? "pr_title",
          linkConfidence: b.linkConfidence ?? 85,
          linkReason: "Auto-confirmed suggestion",
          linkReviewedAt: new Date(),
          linkReviewedById: actorId,
        },
      });

      confirmedCount++;
    }

    if (confirmedCount > 0) {
      await audit({
        actorId,
        actorEmail,
        action: "branch.confirm_all",
        source: "web",
        target: "all_pending",
        after: { confirmedCount },
      });
    }

    return { ok: true, count: confirmedCount };
  } catch (err) {
    return { ok: false, count: 0, error: (err as Error).message };
  }
}
