import { env } from "@/lib/env";
import { extractJiraKeys } from "./branch-linker";
import { bitbucket, getSystemBitbucketCreds, type BbUser, type BbCommit } from "./client";
import { formatCommitCommentNotification } from "./branch-notification-policy";
import { resolveBranchNotificationRecipients } from "./branch-recipient-resolver";
import { deliverBranchNotifications } from "./branch-notification-delivery";

export type NotifyCommitCommentArgs = {
  repo: string;
  commit: {
    id: string;
    message?: string;
    author?: BbUser;
  };
  comment: {
    id: number;
    text: string;
    author: BbUser;
    anchor?: {
      path?: string;
      line?: number;
    };
  };
};

/**
 * Notify the commit author and any linked Jira task assignee/watchers
 * about a new comment posted directly on a commit (outside of PRs).
 * Strictly excludes the comment author.
 */
export async function notifyCommitComment(args: NotifyCommitCommentArgs): Promise<{
  notifiedCount: number;
  targetUserIds: string[];
}> {
  const { repo, commit: rawCommit, comment } = args;

  let fullCommit: BbCommit | null = null;
  if (!rawCommit.author || !rawCommit.message) {
    try {
      const creds = await getSystemBitbucketCreds();
      fullCommit = await bitbucket.getCommit(repo, rawCommit.id, creds ?? undefined);
    } catch {
      /* commit fetch is best-effort */
    }
  }

  const commitAuthor = rawCommit.author ?? fullCommit?.author;
  const commitMessage = rawCommit.message ?? fullCommit?.message ?? "";

  const candidates: BbUser[] = [];
  if (commitAuthor) candidates.push(commitAuthor);
  if (fullCommit?.committer) candidates.push(fullCommit.committer);

  // Discover Jira keys from commit message
  const jiraKeys = extractJiraKeys(commitMessage);

  // Resolve all target recipients and strictly exclude comment author
  const targetUserIds = await resolveBranchNotificationRecipients({
    candidates,
    jiraKeys,
    commentAuthor: comment.author,
  });

  if (targetUserIds.length === 0) {
    return { notifiedCount: 0, targetUserIds: [] };
  }

  // Format notification payload using policy message model
  const message = formatCommitCommentNotification({
    repo,
    commit: { id: rawCommit.id, message: commitMessage },
    comment,
    baseUrl: env.bitbucketBaseUrl,
  });

  // Deliver notification to recipients outside policy
  const notifiedCount = await deliverBranchNotifications(targetUserIds, message);

  return { notifiedCount, targetUserIds };
}
