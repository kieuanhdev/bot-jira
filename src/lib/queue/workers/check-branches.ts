import { prisma } from "@/lib/prisma";
import { bitbucket } from "@/lib/bitbucket/client";
import { resolveBranchLink } from "@/lib/bitbucket/branch-linker";
import { guard, hasBitbucketConfig } from "../guard";
import type { WorkerLog } from "../guard";

export async function runCheckBranches(): Promise<WorkerLog> {
  if (!hasBitbucketConfig()) return guard(hasBitbucketConfig(), "Bitbucket not configured");
  const errors: string[] = [];
  let checked = 0;
  let deleted = 0;
  const runStartedAt = new Date();

  // Load known active issues for candidate resolution
  const activeIssues = await prisma.issueCache.findMany({
    select: { jiraKey: true },
  });
  const validKeys = new Set(activeIssues.map((i) => i.jiraKey));

  for (const repo of bitbucket.repos()) {
    const syncStartedAt = new Date();
    let repoSuccess = false;
    try {
      const status = await bitbucket.branchStatus(repo);
      for (const s of status) {
        const existing = await prisma.branchInfo.findUnique({
          where: { repo_branch: { repo, branch: s.branch.name } },
          select: { jiraKey: true, linkSource: true, linkState: true },
        });

        const linkRes = resolveBranchLink({
          branch: s.branch.name,
          prTitle: s.prTitle,
          existingJiraKey: existing?.jiraKey,
          existingLinkSource: existing?.linkSource,
          existingLinkState: existing?.linkState,
          validJiraKeys: validKeys,
        });

        await prisma.branchInfo.upsert({
          where: { repo_branch: { repo, branch: s.branch.name } },
          update: {
            latestCommitSha: s.branch.latestCommit ?? null,
            lastCommitAt: s.branch.latestCommitDate
              ? new Date(s.branch.latestCommitDate)
              : undefined,
            prId: s.pr?.id ?? null,
            prTitle: s.prTitle ?? null,
            prUrl: s.prUrl ?? null,
            prState: s.prState ?? null,
            prDestinationBranch: s.prDestinationBranch ?? null,
            prUpdatedAt: s.prUpdatedAt ?? null,
            merged: s.merged,
            lastSeenAt: syncStartedAt,
            deletedAt: null,
            jiraKey: linkRes.jiraKey,
            linkSource: linkRes.linkSource,
            linkConfidence: linkRes.linkConfidence,
            linkState: linkRes.linkState,
            suggestedJiraKey: linkRes.suggestedJiraKey,
            checkedAt: new Date(),
          },
          create: {
            repo,
            branch: s.branch.name,
            latestCommitSha: s.branch.latestCommit ?? null,
            lastCommitAt: s.branch.latestCommitDate
              ? new Date(s.branch.latestCommitDate)
              : undefined,
            prId: s.pr?.id ?? null,
            prTitle: s.prTitle ?? null,
            prUrl: s.prUrl ?? null,
            prState: s.prState ?? null,
            prDestinationBranch: s.prDestinationBranch ?? null,
            prUpdatedAt: s.prUpdatedAt ?? null,
            merged: s.merged,
            lastSeenAt: syncStartedAt,
            deletedAt: null,
            jiraKey: linkRes.jiraKey,
            linkSource: linkRes.linkSource,
            linkConfidence: linkRes.linkConfidence,
            linkState: linkRes.linkState,
            suggestedJiraKey: linkRes.suggestedJiraKey,
            checkedAt: new Date(),
          },
        });
        checked++;
      }
      repoSuccess = true;
    } catch (e) {
      errors.push(`${repo}: ${(e as Error).message}`);
    }

    // Only mark deleted branches if the repo fetched successfully without error
    if (repoSuccess) {
      const deleteResult = await prisma.branchInfo.updateMany({
        where: {
          repo,
          deletedAt: null,
          OR: [
            { lastSeenAt: { lt: syncStartedAt } },
            { lastSeenAt: null },
          ],
        },
        data: { deletedAt: syncStartedAt },
      });
      deleted += deleteResult.count;
    }
  }

  // Update integration cursor
  await prisma.integrationCursor.upsert({
    where: {
      integration_scope: {
        integration: "bitbucket",
        scope: "branches",
      },
    },
    update: {
      lastStartedAt: runStartedAt,
      lastSuccessAt: errors.length === 0 ? new Date() : undefined,
      lastErrorAt: errors.length > 0 ? new Date() : undefined,
      lastError: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      stats: { checked, deleted, errorsCount: errors.length },
    },
    create: {
      integration: "bitbucket",
      scope: "branches",
      lastStartedAt: runStartedAt,
      lastSuccessAt: errors.length === 0 ? new Date() : null,
      lastErrorAt: errors.length > 0 ? new Date() : null,
      lastError: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      stats: { checked, deleted, errorsCount: errors.length },
    },
  });

  return { ok: errors.length === 0, stats: { checked, deleted } as unknown as Record<string, number>, errors };
}
