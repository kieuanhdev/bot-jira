import { prisma } from "@/lib/prisma";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";
import { extractJiraKeys } from "./branch-linker";
import type { BbUser } from "./types";
import {
  isSameUser,
  isUserAuthor,
  userMatchesCandidates,
} from "./branch-notification-policy";

/**
 * Matches a list of candidate Bitbucket users to local bot-jira User IDs.
 * Checks jiraUsername aliases, emails, and encrypted Bitbucket credentials fallback.
 */
export async function matchBitbucketUsersToLocalUsers(
  candidates: BbUser[],
  db: typeof prisma = prisma
): Promise<string[]> {
  if (candidates.length === 0) return [];

  const matchedUserIds = new Set<string>();
  const allAliases = new Set<string>();
  const emails = new Set<string>();

  for (const c of candidates) {
    if (c.name) {
      for (const a of jiraUsernameAliases(c.name)) {
        allAliases.add(a);
      }
    }
    if (c.emailAddress) {
      emails.add(c.emailAddress.trim());
    }
  }

  try {
    const matchedUsers = await db.user.findMany({
      where: {
        OR: [
          { jiraUsername: { in: Array.from(allAliases) } },
          ...(emails.size > 0 ? [{ email: { in: Array.from(emails) } }] : []),
        ],
      },
      select: { id: true, jiraUsername: true, email: true },
    });

    for (const u of matchedUsers ?? []) {
      if (userMatchesCandidates(u, candidates)) {
        matchedUserIds.add(u.id);
      }
    }

    // Check encrypted bitbucket credentials fallback
    const usersWithBbCreds = await db.user.findMany({
      where: {
        bitbucketUserEnc: { not: null },
        id: { notIn: Array.from(matchedUserIds) },
      },
      select: { id: true, bitbucketUserEnc: true },
    });

    for (const u of usersWithBbCreds ?? []) {
      const dec = safeDecrypt(u.bitbucketUserEnc);
      if (dec) {
        const decAliases = jiraUsernameAliases(dec);
        const matches = decAliases.some((a) => allAliases.has(a));
        if (matches) {
          matchedUserIds.add(u.id);
        }
      }
    }
  } catch {
    // PR participant matching fallback
  }

  return Array.from(matchedUserIds);
}

/**
 * Discover Jira keys associated with a pull request from branch name, title, and BranchInfo.
 */
export async function discoverPrJiraKeys(
  repo: string,
  pr: { id?: number; branch?: string; title?: string },
  db: typeof prisma = prisma
): Promise<string[]> {
  const jiraKeys = new Set<string>();

  if (pr.branch) {
    for (const k of extractJiraKeys(pr.branch)) {
      jiraKeys.add(k);
    }
  }
  if (pr.title) {
    for (const k of extractJiraKeys(pr.title)) {
      jiraKeys.add(k);
    }
  }

  try {
    const branchOrConditions: Array<{ repo: string; branch?: string; prId?: number }> = [];
    if (pr.branch) {
      branchOrConditions.push({ repo, branch: pr.branch });
    }
    if (pr.id) {
      branchOrConditions.push({ repo, prId: pr.id });
    }
    if (branchOrConditions.length > 0 && db.branchInfo) {
      const branches = await db.branchInfo.findMany({
        where: { OR: branchOrConditions },
        select: {
          jiraKey: true,
          branch: true,
          issueLinks: { where: { linkState: "confirmed" }, select: { jiraKey: true } },
        },
      });
      for (const b of branches ?? []) {
        if (b.jiraKey) jiraKeys.add(b.jiraKey.toUpperCase());
        for (const l of b.issueLinks ?? []) jiraKeys.add(l.jiraKey.toUpperCase());
        for (const k of extractJiraKeys(b.branch)) {
          jiraKeys.add(k);
        }
      }
    }
  } catch {
    // branch lookup is best-effort
  }

  return Array.from(jiraKeys);
}

/**
 * Resolves user IDs for assignees and watchers of the given Jira issue keys.
 */
export async function resolveTaskRecipients(
  jiraKeys: Iterable<string>,
  db: typeof prisma = prisma
): Promise<string[]> {
  const keys = Array.from(jiraKeys);
  if (keys.length === 0) return [];

  const recipientIds = new Set<string>();

  // Find assignees of linked issues
  try {
    if (db.issueCache) {
      const issues = await db.issueCache.findMany({
        where: { jiraKey: { in: keys } },
        select: { jiraKey: true, assigneeJira: true },
      });

      const assigneeAliases = new Set<string>();
      for (const issue of issues ?? []) {
        if (issue.assigneeJira) {
          for (const alias of jiraUsernameAliases(issue.assigneeJira)) {
            assigneeAliases.add(alias);
          }
        }
      }

      if (assigneeAliases.size > 0) {
        const assigneeUsers = await db.user.findMany({
          where: { jiraUsername: { in: Array.from(assigneeAliases) } },
          select: { id: true },
        });
        for (const u of assigneeUsers ?? []) {
          recipientIds.add(u.id);
        }
      }
    }
  } catch {
    // issue query fallback
  }

  // Find watchers of linked issues
  try {
    if (db.watch) {
      const watchers = await db.watch.findMany({
        where: { jiraKey: { in: keys } },
        select: { userId: true },
      });
      for (const w of watchers ?? []) {
        recipientIds.add(w.userId);
      }
    }
  } catch {
    // watch query fallback
  }

  return Array.from(recipientIds);
}

/**
 * Strictly filters out the comment author from the list of candidate recipient user IDs.
 */
export async function excludeCommentAuthor(
  userIds: Iterable<string>,
  commentAuthor: BbUser,
  db: typeof prisma = prisma
): Promise<string[]> {
  const targetUserIds = new Set<string>(userIds);
  if (targetUserIds.size === 0) return [];

  try {
    const usersToVerify = await db.user.findMany({
      where: { id: { in: Array.from(targetUserIds) } },
      select: { id: true, jiraUsername: true, email: true, bitbucketUserEnc: true },
    });

    for (const u of usersToVerify ?? []) {
      if (isUserAuthor(u, commentAuthor)) {
        targetUserIds.delete(u.id);
      }
    }
  } catch {
    // fallback
  }

  return Array.from(targetUserIds);
}

export type ResolveBranchNotificationRecipientsArgs = {
  candidates?: BbUser[];
  jiraKeys?: Iterable<string>;
  commentAuthor: BbUser;
  db?: typeof prisma;
};

/**
 * Unified recipient resolver for branch/commit/PR notifications.
 * Combines candidate matching, Jira task assignees/watchers, and author exclusion.
 */
export async function resolveBranchNotificationRecipients(
  args: ResolveBranchNotificationRecipientsArgs
): Promise<string[]> {
  const { candidates = [], jiraKeys = [], commentAuthor, db = prisma } = args;

  // 1. Filter out candidate Bitbucket users that match the comment author directly
  const filteredCandidates = candidates.filter((c) => !isSameUser(c, commentAuthor));

  // 2. Match candidate Bitbucket users to local bot-jira users
  const matchedUserIds = await matchBitbucketUsersToLocalUsers(filteredCandidates, db);

  // 3. Resolve assignees and watchers for linked Jira tasks
  const taskUserIds = await resolveTaskRecipients(jiraKeys, db);

  // 4. Combine all recipient user IDs
  const allUserIds = new Set<string>([...matchedUserIds, ...taskUserIds]);

  // 5. Strictly exclude the comment author from all target recipients
  return excludeCommentAuthor(allUserIds, commentAuthor, db);
}
