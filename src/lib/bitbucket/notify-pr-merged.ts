import type { BbUser } from "./client";
import {
  isUserAuthor,
  formatUnauthorizedMergeNotification,
} from "./branch-notification-policy";
import { discoverPrJiraKeys } from "./branch-recipient-resolver";
import { deliverBranchNotifications } from "./branch-notification-delivery";
import { getProjectLeaders } from "@/lib/projects/roles";
import { isValidProjectKeyFormat } from "@/lib/jira/project-catalog";
import { logger } from "@/lib/logger";

export type NotifyUnauthorizedMergeArgs = {
  repo: string;
  pr: {
    id: number;
    title?: string;
    url?: string;
    fromBranch?: string;
    toBranch?: string;
  };
  actor: BbUser;
};

export type NotifyUnauthorizedMergeResult = {
  notifiedCount: number;
  targetUserIds: string[];
  skipped?: boolean;
  reason?: string;
};

/**
 * Check if the actor who merged the PR is a configured leader of the project.
 * If not, alert the project's leaders.
 */
export async function notifyUnauthorizedMerge(
  args: NotifyUnauthorizedMergeArgs
): Promise<NotifyUnauthorizedMergeResult> {
  const { repo, pr, actor } = args;

  // 1. Discover Jira keys associated with the PR
  const jiraKeys = await discoverPrJiraKeys(repo, {
    id: pr.id,
    title: pr.title,
    fromRef: pr.fromBranch ? { branch: pr.fromBranch } : undefined,
  });

  if (jiraKeys.length === 0) {
    logger.info({
      message: "PR merge alert skipped: no jira keys discovered",
      repo,
      prId: pr.id,
      reason: "no jira project",
    });
    return {
      notifiedCount: 0,
      targetUserIds: [],
      skipped: true,
      reason: "no_jira_project",
    };
  }

  // 2. Extract unique Jira project keys
  const projectKeys = Array.from(
    new Set(
      jiraKeys
        .map((k) => k.split("-")[0]?.toUpperCase() ?? "")
        .filter((pk) => isValidProjectKeyFormat(pk))
    )
  );

  if (projectKeys.length === 0) {
    logger.info({
      message: "PR merge alert skipped: no valid jira project keys found",
      repo,
      prId: pr.id,
      jiraKeys,
      reason: "no jira project",
    });
    return {
      notifiedCount: 0,
      targetUserIds: [],
      skipped: true,
      reason: "no_jira_project",
    };
  }

  const recipientUserIds = new Set<string>();

  // 3. For each project, check if actor is a leader
  for (const projectKey of projectKeys) {
    const leaders = await getProjectLeaders(projectKey);

    if (leaders.length === 0) {
      logger.info({
        message: "PR merge alert: project has no configured leaders",
        repo,
        prId: pr.id,
        projectKey,
        reason: "no leaders configured",
      });
      continue;
    }

    // Check if the actor matches any leader of this project
    const isActorLeader = leaders.some((leader) => isUserAuthor(leader, actor));

    if (isActorLeader) {
      // Actor IS leader of this project -> do not notify for this project
      logger.info({
        message: "PR merge by leader: no alert needed for project",
        repo,
        prId: pr.id,
        projectKey,
        actor: actor.name || actor.displayName,
      });
      continue;
    }

    // Actor is NOT a leader -> all leaders of this project are targets
    for (const leader of leaders) {
      // Don't notify the actor even if somehow present in the list
      if (!isUserAuthor(leader, actor)) {
        recipientUserIds.add(leader.id);
      }
    }
  }

  const targetUserIds = Array.from(recipientUserIds);
  if (targetUserIds.length === 0) {
    return {
      notifiedCount: 0,
      targetUserIds: [],
      skipped: true,
      reason: "actor_is_leader_or_no_recipients",
    };
  }

  // 4. Format unauthorized merge alert notification
  const message = formatUnauthorizedMergeNotification({
    repo,
    pr,
    actor,
    jiraKeys,
  });

  // 5. Deliver notification to all target leaders
  const notifiedCount = await deliverBranchNotifications(targetUserIds, message);

  logger.info({
    message: "Delivered unauthorized merge alert to project leaders",
    repo,
    prId: pr.id,
    targetCount: targetUserIds.length,
    notifiedCount,
  });

  return {
    notifiedCount,
    targetUserIds,
    skipped: false,
  };
}
