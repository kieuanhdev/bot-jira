import type { BbUser } from "./client";
import {
  isSameUser,
  formatPrCommentNotification,
} from "./branch-notification-policy";
import {
  discoverPrJiraKeys,
  resolveBranchNotificationRecipients,
} from "./branch-recipient-resolver";
import { deliverBranchNotifications } from "./branch-notification-delivery";

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
};

/**
 * Notify the PR author, reviewers, and any Jira task assignee/watchers
 * linked to the PR branch about a new comment.
 * Excludes the comment author.
 * Sends both in-app/push notification and chat (Discord) delivery.
 */
export async function notifyPrComment(args: NotifyPrCommentArgs): Promise<{
  notifiedCount: number;
  targetUserIds: string[];
}> {
  const { repo, pr, comment } = args;

  // 1. Gather candidate recipients from PR metadata: author + reviewers
  const candidates: BbUser[] = [];
  if (pr.author?.user) {
    candidates.push(pr.author.user);
  }
  if (pr.reviewers) {
    for (const r of pr.reviewers) {
      if (r.user) candidates.push(r.user);
    }
  }

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
  const message = formatPrCommentNotification({ repo, pr, comment });

  // 5. Deliver notification to recipients outside policy
  const notifiedCount = await deliverBranchNotifications(targetUserIds, message);

  return { notifiedCount, targetUserIds };
}
