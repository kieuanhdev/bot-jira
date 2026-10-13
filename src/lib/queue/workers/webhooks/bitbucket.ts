import type { BbUser } from "@/lib/bitbucket/client";
import type { PrCommentThread } from "@/lib/bitbucket/branch-notification-policy";
import { findThreadRoot, threadAuthors } from "@/lib/bitbucket/comment-thread";
import { prisma } from "@/lib/prisma";

type BitbucketUser = {
  name?: string;
  displayName?: string;
  emailAddress?: string;
};

type PullRequest = {
  id?: number;
  title?: string;
  url?: string;
  state?: string;
  fromRef?: { branch?: string; displayId?: string };
  toRef?: {
    branch?: string;
    displayId?: string;
    repository?: { slug?: string; project?: { key?: string } };
  };
  author?: { user?: BitbucketUser };
  reviewers?: Array<{ user?: BitbucketUser }>;
};

type Comment = {
  id?: number;
  text?: string;
  author?: BitbucketUser;
  anchor?: { path?: string; line?: number };
};

type BitbucketWebhookPayload = {
  eventKey?: string;
  actor?: BitbucketUser;
  data?: {
    actor?: BitbucketUser;
    repository?: { slug?: string; project?: { key?: string } };
    pullRequest?: PullRequest;
    comment?: Comment;
    branches?: Array<{ name?: string; latestCommit?: string }>;
    commit?: { id?: string } | string;
  };
  repository?: { slug?: string; project?: { key?: string } };
  pullRequest?: PullRequest;
  comment?: Comment;
  /** Set by Bitbucket DC on `pr:comment:added` when the comment is a reply. */
  commentParentId?: number;
  commit?: { id?: string } | string;
};

/**
 * Thread context for a PR comment. Replies need the thread's participants,
 * which only the PR activity feed has; on any failure the thread stays unknown
 * and the notifier falls back to the PR author plus reviewers.
 */
async function resolvePrCommentThread(
  repo: string,
  prId: number,
  parentId: number | undefined
): Promise<PrCommentThread | undefined> {
  if (!parentId) return { isReply: false };
  try {
    const { bitbucket, getSystemBitbucketCreds } = await import("@/lib/bitbucket/client");
    const creds = await getSystemBitbucketCreds();
    const activities = await bitbucket.listPullRequestActivities(repo, prId, creds ?? undefined);
    const root = findThreadRoot(activities, parentId);
    return root ? { isReply: true, participants: threadAuthors(root) } : undefined;
  } catch {
    return undefined;
  }
}

export async function handleBitbucketWebhook(
  payload: unknown
): Promise<Record<string, unknown>> {
  const webhook = payload as BitbucketWebhookPayload;
  const repository =
    webhook.data?.repository ??
    webhook.pullRequest?.toRef?.repository ??
    webhook.repository;
  const repo = repository
    ? `${repository.project?.key ?? ""}/${repository.slug ?? ""}`
    : undefined;
  if (!repo) return { skipped: true, reason: "no repository" };
  // No system-token gate: the payload carries what notifications need, and the
  // optional API lookups below fall back to stored user creds or skip.

  const pullRequest = webhook.pullRequest ?? webhook.data?.pullRequest;
  const comment = webhook.comment ?? webhook.data?.comment;
  if (
    webhook.eventKey?.startsWith("pr:comment:") ||
    (comment?.id && comment?.text && pullRequest?.id)
  ) {
    if (comment?.id && comment.text && pullRequest?.id) {
      const { bitbucket, getSystemBitbucketCreds } = await import("@/lib/bitbucket/client");
      const { notifyPrComment } = await import("@/lib/bitbucket/notify-pr-comment");
      let fullPullRequest = pullRequest;
      if (!pullRequest.author?.user || !pullRequest.reviewers) {
        const creds = await getSystemBitbucketCreds().catch(() => null);
        const fetched = await bitbucket
          .getPullRequest(repo, pullRequest.id, creds ?? undefined)
          .catch(() => null);
        if (fetched) fullPullRequest = fetched as typeof pullRequest;
      }
      const thread = await resolvePrCommentThread(
        repo,
        pullRequest.id,
        webhook.commentParentId
      );

      const result = await notifyPrComment({
        repo,
        pr: {
          id: pullRequest.id,
          title: fullPullRequest.title ?? pullRequest.title,
          branch: fullPullRequest.fromRef?.branch ?? pullRequest.fromRef?.branch,
          url: fullPullRequest.url ?? pullRequest.url,
          author: fullPullRequest.author as { user: BbUser } | undefined,
          reviewers: fullPullRequest.reviewers as Array<{ user: BbUser }> | undefined,
        },
        comment: {
          id: comment.id,
          text: comment.text,
          author: comment.author as BbUser,
        },
        thread,
      });
      return {
        repo,
        prId: pullRequest.id,
        isReply: thread?.isReply ?? null,
        commentId: comment.id,
        notifiedCount: result.notifiedCount,
      };
    }
    return { skipped: true, reason: "incomplete comment payload" };
  }

  const rawCommit = webhook.commit ?? webhook.data?.commit;
  const commitId = typeof rawCommit === "string" ? rawCommit : rawCommit?.id;
  if (
    (webhook.eventKey?.startsWith("repo:comment:") ||
      (comment?.id && comment?.text && commitId)) &&
    !pullRequest?.id
  ) {
    if (comment?.id && comment.text && commitId) {
      const { notifyCommitComment } = await import(
        "@/lib/bitbucket/notify-commit-comment"
      );
      const result = await notifyCommitComment({
        repo,
        commit: { id: commitId },
        comment: {
          id: comment.id,
          text: comment.text,
          author: comment.author as BbUser,
          anchor: comment.anchor,
        },
      });
      return {
        repo,
        commitId,
        commentId: comment.id,
        notifiedCount: result.notifiedCount,
      };
    }
    return { skipped: true, reason: "incomplete commit comment payload" };
  }

  const updates: Record<string, unknown> = { repo };

  const isPrMerged =
    webhook.eventKey === "pr:merged" ||
    (pullRequest?.id != null && pullRequest.state === "MERGED");

  if (isPrMerged && pullRequest?.id != null) {
    let actor = webhook.actor ?? webhook.data?.actor;
    if (!actor) {
      try {
        const { bitbucket, getSystemBitbucketCreds } = await import("@/lib/bitbucket/client");
        const creds = await getSystemBitbucketCreds();
        const activities = await bitbucket.listPullRequestActivities(
          repo,
          pullRequest.id,
          creds ?? undefined
        );
        const mergeActivity = activities.find(
          (a) => a.action === "MERGED" && a.user
        );
        if (mergeActivity?.user) {
          actor = mergeActivity.user;
        }
      } catch {
        // Fallback activity lookup failed or unconfigured
      }
    }

    if (actor) {
      const { notifyUnauthorizedMerge } = await import("@/lib/bitbucket/notify-pr-merged");
      const fromBranch =
        pullRequest.fromRef?.branch ??
        (pullRequest.fromRef as { displayId?: string })?.displayId;
      const toBranch =
        pullRequest.toRef?.branch ??
        (pullRequest.toRef as { displayId?: string })?.displayId;
      const mergeAlertResult = await notifyUnauthorizedMerge({
        repo,
        pr: {
          id: pullRequest.id,
          title: pullRequest.title,
          url: pullRequest.url,
          fromBranch,
          toBranch,
        },
        actor,
      });
      updates.mergeAlert = mergeAlertResult;
    }
  }

  const fromBranch =
    pullRequest?.fromRef?.branch ??
    (pullRequest?.fromRef as { displayId?: string })?.displayId;
  const toBranch =
    pullRequest?.toRef?.branch ??
    (pullRequest?.toRef as { displayId?: string })?.displayId;

  if (fromBranch) {
    const isMergedState =
      pullRequest?.state === "MERGED" || webhook.eventKey === "pr:merged";
    await prisma.branchInfo.upsert({
      where: { repo_branch: { repo, branch: fromBranch } },
      create: {
        repo,
        branch: fromBranch,
        prId: pullRequest?.id ?? null,
        prState: pullRequest?.state ?? (isMergedState ? "MERGED" : null),
        prDestinationBranch: toBranch ?? null,
        merged: isMergedState,
        checkedAt: new Date(),
      },
      update: {
        prId: pullRequest?.id ?? null,
        prState: pullRequest?.state ?? (isMergedState ? "MERGED" : null),
        prDestinationBranch: toBranch ?? null,
        merged: isMergedState,
        checkedAt: new Date(),
      },
    });
    updates.branch = fromBranch;
    updates.prState =
      pullRequest?.state ?? (isMergedState ? "MERGED" : undefined);
  }
  if (webhook.data?.branches) {
    for (const branch of webhook.data.branches) {
      if (!branch.name) continue;
      await prisma.branchInfo.upsert({
        where: { repo_branch: { repo, branch: branch.name } },
        create: {
          repo,
          branch: branch.name,
          lastCommitAt: branch.latestCommit ? new Date(branch.latestCommit) : null,
          checkedAt: new Date(),
        },
        update: {
          lastCommitAt: branch.latestCommit ? new Date(branch.latestCommit) : undefined,
          checkedAt: new Date(),
        },
      });
    }
  }
  return updates;
}
