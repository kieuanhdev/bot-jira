import type { BbUser } from "@/lib/bitbucket/client";
import { prisma } from "@/lib/prisma";
import { hasBitbucketConfig } from "../../guard";

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
  fromRef?: { branch?: string };
  toRef?: {
    branch?: string;
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
  data?: {
    repository?: { slug?: string; project?: { key?: string } };
    pullRequest?: PullRequest;
    comment?: Comment;
    branches?: Array<{ name?: string; latestCommit?: string }>;
    commit?: { id?: string } | string;
  };
  repository?: { slug?: string; project?: { key?: string } };
  pullRequest?: PullRequest;
  comment?: Comment;
  commit?: { id?: string } | string;
};

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
  if (!hasBitbucketConfig()) {
    return { skipped: true, reason: "bitbucket not configured" };
  }

  const pullRequest = webhook.pullRequest ?? webhook.data?.pullRequest;
  const comment = webhook.comment ?? webhook.data?.comment;
  if (
    webhook.eventKey?.startsWith("pr:comment:") ||
    (comment?.id && comment?.text && pullRequest?.id)
  ) {
    if (comment?.id && comment.text && pullRequest?.id) {
      const { bitbucket } = await import("@/lib/bitbucket/client");
      const { notifyPrComment } = await import("@/lib/bitbucket/notify-pr-comment");
      let fullPullRequest = pullRequest;
      if (!pullRequest.author?.user || !pullRequest.reviewers) {
        const fetched = await bitbucket
          .getPullRequest(repo, pullRequest.id)
          .catch(() => null);
        if (fetched) fullPullRequest = fetched as typeof pullRequest;
      }

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
      });
      return {
        repo,
        prId: pullRequest.id,
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
  if (pullRequest?.fromRef?.branch) {
    await prisma.branchInfo.upsert({
      where: { repo_branch: { repo, branch: pullRequest.fromRef.branch } },
      create: {
        repo,
        branch: pullRequest.fromRef.branch,
        prId: pullRequest.id ?? null,
        prState: pullRequest.state ?? null,
        prDestinationBranch: pullRequest.toRef?.branch ?? null,
        merged: pullRequest.state === "MERGED",
        checkedAt: new Date(),
      },
      update: {
        prId: pullRequest.id ?? null,
        prState: pullRequest.state ?? null,
        prDestinationBranch: pullRequest.toRef?.branch ?? null,
        merged: pullRequest.state === "MERGED",
        checkedAt: new Date(),
      },
    });
    updates.branch = pullRequest.fromRef.branch;
    updates.prState = pullRequest.state;
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
