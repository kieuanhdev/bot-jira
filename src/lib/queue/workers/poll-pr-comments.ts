import { prisma } from "@/lib/prisma";
import { bitbucket, isBitbucketPermissionError, type BbPrActivity, type BbPrComment, type BbPullRequest } from "@/lib/bitbucket/client";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";
import { guard } from "../guard";
import type { WorkerLog } from "../guard";

function extractComments(activity: BbPrActivity): BbPrComment[] {
  const result: BbPrComment[] = [];
  if (activity.comment) {
    result.push(activity.comment);
    if (Array.isArray(activity.comment.comments)) {
      for (const child of activity.comment.comments) {
        result.push(child);
      }
    }
  }
  return result;
}

const MAX_CLOSED_PR_AGE_MS = 180 * 24 * 3600 * 1000; // 180 days (~6 months)

/**
 * Determine if a pull request should be scanned for comments.
 * - Always scan OPEN PRs.
 * - For MERGED/DECLINED PRs: only scan if the PR was updated within the last 180 days
 *   AND its author or at least one reviewer matches a registered bot-jira user.
 *   (Comments on closed PRs where none of our users participate cannot trigger notifications anyway).
 */
export function isPrCandidate(pr: BbPullRequest, userTokens: Set<string>): boolean {
  if (pr.state === "OPEN" || !pr.state) return true;

  if (userTokens.size === 0) return false;

  if (pr.updatedDate && Date.now() - pr.updatedDate > MAX_CLOSED_PR_AGE_MS) {
    return false;
  }

  const authorName = pr.author?.user?.name?.toLowerCase();
  const authorEmail = pr.author?.user?.emailAddress?.toLowerCase();
  if (authorName && (userTokens.has(authorName) || jiraUsernameAliases(authorName).some((a) => userTokens.has(a)))) {
    return true;
  }
  if (authorEmail && userTokens.has(authorEmail)) {
    return true;
  }

  if (pr.reviewers) {
    for (const r of pr.reviewers) {
      const revName = r.user?.name?.toLowerCase();
      const revEmail = r.user?.emailAddress?.toLowerCase();
      if (revName && (userTokens.has(revName) || jiraUsernameAliases(revName).some((a) => userTokens.has(a)))) {
        return true;
      }
      if (revEmail && userTokens.has(revEmail)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Worker that periodically polls Pull Requests across configured Bitbucket
 * repositories, identifies new comments, and sends notifications to the PR
 * author and reviewers.
 *
 * Uses `IntegrationCursor` per repository to track the latest seen comment timestamp
 * so comments are only processed once. On initial run for a repo, it captures the current
 * baseline without firing spam for past comments.
 */
export async function runPollPrComments(): Promise<WorkerLog> {
  const { getSystemBitbucketCreds } = await import("@/lib/bitbucket/client");
  const creds = await getSystemBitbucketCreds();
  if (!creds) {
    return guard(false, "Bitbucket not configured in env or user settings");
  }

  // Build a lookup set of registered user usernames/aliases/emails
  const userTokens = new Set<string>();
  try {
    const registeredUsers = await prisma.user.findMany({
      select: { id: true, jiraUsername: true, email: true, bitbucketUserEnc: true },
    });
    for (const u of registeredUsers) {
      if (u.jiraUsername) {
        for (const a of jiraUsernameAliases(u.jiraUsername)) {
          userTokens.add(a.toLowerCase());
        }
      }
      if (u.email) {
        userTokens.add(u.email.toLowerCase().trim());
      }
      if (u.bitbucketUserEnc) {
        const dec = safeDecrypt(u.bitbucketUserEnc);
        if (dec) {
          for (const a of jiraUsernameAliases(dec)) {
            userTokens.add(a.toLowerCase());
          }
        }
      }
    }
  } catch {
    /* fallback to empty tokens if user table query fails */
  }

  const errors: string[] = [];
  let checkedRepos = 0;
  let checkedPrs = 0;
  let newCommentsNotified = 0;
  let skippedUnauthorizedRepos = 0;

  for (const repo of bitbucket.repos()) {
    checkedRepos++;
    const scope = `pr-comments:${repo}`;

    try {
      const cursorRecord = await prisma.integrationCursor.findUnique({
        where: { integration_scope: { integration: "bitbucket", scope } },
      });

      // Quét các PR (OPEN + các PR merged/declined gần đây)
      const prs = typeof bitbucket.listPullRequests === "function"
        ? await bitbucket.listPullRequests(repo, creds, 2)
        : await bitbucket.listOpenPullRequests(repo, creds);

      const candidatePrs = prs.filter((pr) => isPrCandidate(pr, userTokens));
      checkedPrs += candidatePrs.length;

      const baselineCursor = cursorRecord?.cursor ? Number(cursorRecord.cursor) : 0;
      let nextCursor = baselineCursor;
      const isInitialRun = !cursorRecord || !cursorRecord.cursor;

      for (const pr of candidatePrs) {
        // Đối với OPEN PR: Bitbucket tự động cập nhật pr.updatedDate khi có comment.
        // Có thể bỏ qua nếu updatedDate <= baselineCursor.
        // Đối với MERGED PR: Bitbucket KHÔNG cập nhật pr.updatedDate khi có comment mới,
        // nên không được bỏ qua bằng pr.updatedDate.
        if (pr.state === "OPEN" && !isInitialRun && baselineCursor > 0 && pr.updatedDate && pr.updatedDate <= baselineCursor) {
          continue;
        }

        try {
          const activities = await bitbucket.listPullRequestActivities(repo, pr.id, creds);
          for (const act of activities) {
            if (act.action !== "COMMENTED") continue;

            const comments = extractComments(act);
            for (const comment of comments) {
              const commentTime = comment.createdDate ?? act.createdDate ?? 0;
              if (commentTime > baselineCursor) {
                nextCursor = Math.max(nextCursor, commentTime);
                if (!isInitialRun) {
                  const res = await notifyPrComment({ repo, pr, comment });
                  newCommentsNotified += res.notifiedCount;
                }
              }
            }
          }
        } catch (prErr) {
          if (isBitbucketPermissionError(prErr)) {
            console.warn(`[poll-pr-comments] Bỏ qua activities trên ${repo} PR #${pr.id}: không có quyền truy cập`);
          } else {
            errors.push(`${repo} PR #${pr.id}: ${(prErr as Error).message}`);
          }
        }
      }

      if (isInitialRun && nextCursor === 0) {
        nextCursor = Date.now();
      }

      // Upsert the cursor with latest seen timestamp
      await prisma.integrationCursor.upsert({
        where: { integration_scope: { integration: "bitbucket", scope } },
        create: {
          integration: "bitbucket",
          scope,
          cursor: String(nextCursor),
          lastSuccessAt: new Date(),
          stats: { checkedPrs: candidatePrs.length },
        },
        update: {
          cursor: String(nextCursor),
          lastSuccessAt: new Date(),
          stats: { checkedPrs: candidatePrs.length },
        },
      });
    } catch (repoErr) {
      if (isBitbucketPermissionError(repoErr)) {
        skippedUnauthorizedRepos++;
        console.warn(`[poll-pr-comments] Bỏ qua repo ${repo}: không có quyền truy cập (401/403)`);
      } else {
        errors.push(`${repo}: ${(repoErr as Error).message}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    stats: {
      checkedRepos,
      checkedPrs,
      newCommentsNotified,
      skippedUnauthorizedRepos,
    },
  };
}
