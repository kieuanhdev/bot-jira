import type { BbUser } from "./client";
import {
  isSameUser,
  formatPrCommentNotification,
  prCommentCandidates,
  type PrCommentThread,
} from "./branch-notification-policy";
import {
  discoverPrJiraKeys,
  resolveBranchNotificationRecipients,
} from "./branch-recipient-resolver";
import { deliverBranchNotifications } from "./branch-notification-delivery";
import { env } from "@/lib/env";

export { isSameUser };

export type NotifyPrCommentArgs = {
  repo: string;
  pr: {
    id: number;
    title?: string;
    url?: string;
    branch?: string;
    author?: {
      user: BbUser;
    };
    reviewers?: Array<{
      user: BbUser;
    }>;
  };
  comment: {
    id: number;
    text: string;
    author: BbUser;
  };
  thread?: PrCommentThread;
};

/**
 * Notify the people a PR comment concerns (see `prCommentCandidates`) plus any
 * Jira task assignee/watchers linked to the PR branch. Excludes the comment author.
 * Sends an in-app/push notification per comment; Discord is batched per PR.
 */
export async function notifyPrComment(args: NotifyPrCommentArgs): Promise<{
  notifiedCount: number;
  targetUserIds: string[];
}> {
  const { repo, pr, comment } = args;

  // 1. Gather candidate recipients from PR metadata and the comment thread
  const candidates = prCommentCandidates({
    prAuthor: pr.author?.user,
    reviewers: pr.reviewers?.flatMap((r) => (r.user ? [r.user] : [])),
    commentAuthor: comment.author,
    thread: args.thread,
  });

  // 2. Discover related Jira tasks from PR branch name, PR title, and BranchInfo
  const jiraKeys = await discoverPrJiraKeys(repo, pr);

  // 3. Resolve all target recipients and strictly exclude comment author
  const targetUserIds = await resolveBranchNotificationRecipients({
    candidates,
    jiraKeys,
    commentAuthor: comment.author,
  });

  if (targetUserIds.length === 0) {
    return { notifiedCount: 0, targetUserIds: [] };
  }

  // 4. Format notification payload using policy message model
  const message = formatPrCommentNotification({ repo, pr, comment, baseUrl: env.bitbucketBaseUrl });

  // 5. Deliver notification to recipients outside policy
  const notifiedCount = await deliverBranchNotifications(targetUserIds, message);

  return { notifiedCount, targetUserIds };
}
