import { prisma } from "@/lib/prisma";
import { bitbucket, isBitbucketPermissionError } from "@/lib/bitbucket/client";
import {
  resolveBranchLink,
  extractJiraKeys,
  isSystemOrReleaseBranch,
} from "@/lib/bitbucket/branch-linker";
import { guard } from "../guard";
import type { WorkerLog } from "../guard";

export async function runCheckBranches(): Promise<WorkerLog> {
  const { getSystemBitbucketCreds } = await import("@/lib/bitbucket/client");
  const creds = await getSystemBitbucketCreds();
  if (!creds) return guard(false, "Bitbucket not configured in env or user settings");
  const errors: string[] = [];
  let checked = 0;
  let deleted = 0;
  let skippedUnauthorized = 0;
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

        let commitMessages: string[] | undefined = undefined;
        const branchKeys = extractJiraKeys(s.branch.name);
        const prKeys = s.prTitle ? extractJiraKeys(s.prTitle) : [];
        if (
          branchKeys.length === 0 &&
          prKeys.length === 0 &&
          !isSystemOrReleaseBranch(s.branch.name) &&
          s.branch.latestCommit &&
          (!existing?.jiraKey || existing.linkSource === "commit_message")
        ) {
          try {
            const commit = await bitbucket.getCommit(repo, s.branch.latestCommit);
            if (commit?.message) {
              commitMessages = [commit.message];
            }
          } catch {
            // ignore commit fetch error
          }
        }

        let linkRes = resolveBranchLink({
          branch: s.branch.name,
          prTitle: s.prTitle,
          commitMessages,
          existingJiraKey: existing?.jiraKey,
          existingLinkSource: existing?.linkSource,
          existingLinkState: existing?.linkState,
          validJiraKeys: validKeys,
        });

        // Never invent an issue: a key that is not in IssueCache yet becomes a suggestion,
        // and is promoted to a confirmed link on a later run once the issue is synced.
        if (linkRes.jiraKey && !validKeys.has(linkRes.jiraKey)) {
          linkRes = {
            jiraKey: null,
            linkSource: linkRes.linkSource,
            linkConfidence: linkRes.linkConfidence,
            linkState: "suggested",
            suggestedJiraKey: linkRes.jiraKey,
            reason: `Task ${linkRes.jiraKey} chưa có trong bộ nhớ đệm Jira`,
          };
        }

        // Adopt a suggestion parsed from a Jira comment for the same branch name.
        const placeholders = await prisma.branchInfo.findMany({
          where: { branch: s.branch.name, repo: { startsWith: "jira-comment:" }, deletedAt: null },
          select: { id: true, suggestedJiraKey: true },
        });
        if (placeholders.length > 0) {
          const hint = placeholders.find((p) => p.suggestedJiraKey && validKeys.has(p.suggestedJiraKey));
          if (!linkRes.jiraKey && !linkRes.suggestedJiraKey && linkRes.linkState === "unlinked" && hint) {
            linkRes = {
              jiraKey: null,
              linkSource: "comment",
              linkConfidence: 60,
              linkState: "suggested",
              suggestedJiraKey: hint.suggestedJiraKey,
            };
          }
          // The real Bitbucket row supersedes the comment placeholder.
          await prisma.branchInfo.updateMany({
            where: { id: { in: placeholders.map((p) => p.id) } },
            data: { deletedAt: new Date() },
          });
        }

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
      if (isBitbucketPermissionError(e)) {
        skippedUnauthorized++;
        console.warn(`[check-branches] Bỏ qua repo ${repo}: không có quyền truy cập (401/403)`);
      } else {
        errors.push(`${repo}: ${(e as Error).message}`);
      }
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
      stats: { checked, deleted, skippedUnauthorized, errorsCount: errors.length },
    },
    create: {
      integration: "bitbucket",
      scope: "branches",
      lastStartedAt: runStartedAt,
      lastSuccessAt: errors.length === 0 ? new Date() : null,
      lastErrorAt: errors.length > 0 ? new Date() : null,
      lastError: errors.length > 0 ? errors.join("; ").slice(0, 500) : null,
      stats: { checked, deleted, skippedUnauthorized, errorsCount: errors.length },
    },
  });

  return { ok: errors.length === 0, stats: { checked, deleted, skippedUnauthorized }, errors: errors.length > 0 ? errors : undefined };
}
