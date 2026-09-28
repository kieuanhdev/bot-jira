import { prisma } from "@/lib/prisma";
import { bitbucket, isBitbucketPermissionError, type BbPrActivity, type BbPrComment } from "@/lib/bitbucket/client";
import { notifyPrComment } from "@/lib/bitbucket/notify-pr-comment";
import { guard, hasBitbucketConfig } from "../guard";
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

/**
 * Worker that periodically polls open Pull Requests across configured Bitbucket
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

      // Quét các PR ở mọi trạng thái (OPEN, MERGED, DECLINED) để nhận thông báo comment cả khi PR đã merge/đóng
      const prs = typeof bitbucket.listPullRequests === "function"
        ? await bitbucket.listPullRequests(repo, creds, 2)
        : await bitbucket.listOpenPullRequests(repo, creds);
      checkedPrs += prs.length;

      let maxSeenTime = cursorRecord?.cursor ? Number(cursorRecord.cursor) : 0;
      const isInitialRun = !cursorRecord || !cursorRecord.cursor;

      for (const pr of prs) {
        // Bỏ qua các PR không có hoạt động mới hơn maxSeenTime
        if (!isInitialRun && maxSeenTime > 0 && pr.updatedDate && pr.updatedDate <= maxSeenTime) {
          continue;
        }

        try {
          const activities = await bitbucket.listPullRequestActivities(repo, pr.id, creds);
          for (const act of activities) {
            if (act.action !== "COMMENTED") continue;

            const comments = extractComments(act);
            for (const comment of comments) {
              const commentTime = comment.createdDate ?? act.createdDate ?? 0;
              if (commentTime > maxSeenTime) {
                maxSeenTime = Math.max(maxSeenTime, commentTime);
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

      // Upsert the cursor with latest seen timestamp
      await prisma.integrationCursor.upsert({
        where: { integration_scope: { integration: "bitbucket", scope } },
        create: {
          integration: "bitbucket",
          scope,
          cursor: String(maxSeenTime),
          lastSuccessAt: new Date(),
          stats: { checkedPrs: prs.length },
        },
        update: {
          cursor: String(maxSeenTime),
          lastSuccessAt: new Date(),
          stats: { checkedPrs: prs.length },
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
