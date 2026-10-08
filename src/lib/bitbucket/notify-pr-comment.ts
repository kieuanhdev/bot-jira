import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";
import { extractJiraKeys } from "./branch-linker";
import type { BbUser } from "./client";

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

/** Normalize username or email for safe comparison. */
function norm(str?: string | null): string {
  return (str ?? "").trim().toLowerCase();
}

/** Check if two Bitbucket users represent the same person. */
export function isSameUser(u1: BbUser, u2: BbUser): boolean {
  if (u1.name && u2.name) {
    const aliases1 = jiraUsernameAliases(u1.name);
    const aliases2 = jiraUsernameAliases(u2.name);
    const nameMatch = aliases1.some((a1) => aliases2.includes(a1));
    if (nameMatch) return true;
  }
  if (u1.emailAddress && u2.emailAddress && norm(u1.emailAddress) === norm(u2.emailAddress)) {
    return true;
  }
  return false;
}

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
  const commentAuthor = comment.author;

  const targetUserIds = new Set<string>();

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

  // Filter out candidates that match comment author directly
  const filteredCandidates = candidates.filter((c) => !isSameUser(c, commentAuthor));

  if (filteredCandidates.length > 0) {
    const allAliases = new Set<string>();
    const emails = new Set<string>();
    for (const c of filteredCandidates) {
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
      const matchedUsers = await prisma.user.findMany({
        where: {
          OR: [
            { jiraUsername: { in: Array.from(allAliases) } },
            ...(emails.size > 0 ? [{ email: { in: Array.from(emails) } }] : []),
          ],
        },
        select: { id: true, jiraUsername: true, email: true },
      });

      for (const u of matchedUsers) {
        const uJira = u.jiraUsername ? jiraUsernameAliases(u.jiraUsername) : [];
        const uEmail = norm(u.email);
        const matchesCandidate = filteredCandidates.some((c) => {
          const cAliases = c.name ? jiraUsernameAliases(c.name) : [];
          const hasNameMatch = cAliases.some((ca) => uJira.includes(ca));
          const hasEmailMatch = Boolean(c.emailAddress && norm(c.emailAddress) === uEmail);
          return hasNameMatch || hasEmailMatch;
        });
        if (matchesCandidate) {
          targetUserIds.add(u.id);
        }
      }

      // Check encrypted bitbucket credentials fallback
      const usersWithBbCreds = await prisma.user.findMany({
        where: {
          bitbucketUserEnc: { not: null },
          id: { notIn: Array.from(targetUserIds) },
        },
        select: { id: true, bitbucketUserEnc: true },
      });

      for (const u of usersWithBbCreds) {
        const dec = safeDecrypt(u.bitbucketUserEnc);
        if (dec) {
          const decAliases = jiraUsernameAliases(dec);
          const matches = decAliases.some((a) => allAliases.has(a));
          if (matches) {
            targetUserIds.add(u.id);
          }
        }
      }
    } catch {
      /* PR participant matching fallback */
    }
  }

  // 2. Discover related Jira tasks from PR branch name, PR title, and BranchInfo
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
    if (branchOrConditions.length > 0 && prisma.branchInfo) {
      const branches = await prisma.branchInfo.findMany({
        where: { OR: branchOrConditions },
        select: { jiraKey: true, branch: true, issueLinks: { where: { linkState: "confirmed" }, select: { jiraKey: true } } },
      });
      for (const b of branches) {
        if (b.jiraKey) jiraKeys.add(b.jiraKey.toUpperCase());
        for (const l of b.issueLinks ?? []) jiraKeys.add(l.jiraKey.toUpperCase());
        for (const k of extractJiraKeys(b.branch)) {
          jiraKeys.add(k);
        }
      }
    }
  } catch {
    /* branch lookup is best-effort */
  }

  // 3. For any linked Jira tasks, include the assignee and watchers
  if (jiraKeys.size > 0) {
    const keys = Array.from(jiraKeys);

    // Find Assignees of linked issues
    try {
      if (prisma.issueCache) {
        const issues = await prisma.issueCache.findMany({
          where: { jiraKey: { in: keys } },
          select: { jiraKey: true, assigneeJira: true },
        });

        const assigneeAliases = new Set<string>();
        for (const issue of issues) {
          if (issue.assigneeJira) {
            for (const alias of jiraUsernameAliases(issue.assigneeJira)) {
              assigneeAliases.add(alias);
            }
          }
        }

        if (assigneeAliases.size > 0) {
          const assigneeUsers = await prisma.user.findMany({
            where: { jiraUsername: { in: Array.from(assigneeAliases) } },
            select: { id: true },
          });
          for (const u of assigneeUsers) {
            targetUserIds.add(u.id);
          }
        }
      }
    } catch {
      /* issue query fallback */
    }

    // Find Watchers of linked issues
    try {
      if (prisma.watch) {
        const watchers = await prisma.watch.findMany({
          where: { jiraKey: { in: keys } },
          select: { userId: true },
        });
        for (const w of watchers) {
          targetUserIds.add(w.userId);
        }
      }
    } catch {
      /* watch query fallback */
    }
  }

  // 4. Strictly exclude the comment author from all target recipients
  if (targetUserIds.size > 0) {
    try {
      const usersToVerify = await prisma.user.findMany({
        where: { id: { in: Array.from(targetUserIds) } },
        select: { id: true, jiraUsername: true, email: true, bitbucketUserEnc: true },
      });

      const commentAuthorAliases = commentAuthor.name ? jiraUsernameAliases(commentAuthor.name) : [];

      for (const u of usersToVerify) {
        const uAliases = u.jiraUsername ? jiraUsernameAliases(u.jiraUsername) : [];
        const isAuthorName = commentAuthorAliases.some((ca) => uAliases.includes(ca));
        const isAuthorEmail = Boolean(
          commentAuthor.emailAddress && u.email && norm(commentAuthor.emailAddress) === norm(u.email)
        );
        let isAuthorDec = false;
        if (u.bitbucketUserEnc) {
          const dec = safeDecrypt(u.bitbucketUserEnc);
          if (dec && commentAuthorAliases.some((ca) => jiraUsernameAliases(dec).includes(ca))) {
            isAuthorDec = true;
          }
        }

        if (isAuthorName || isAuthorEmail || isAuthorDec) {
          targetUserIds.delete(u.id);
        }
      }
    } catch {
      /* fallback */
    }
  }

  if (targetUserIds.size === 0) {
    return { notifiedCount: 0, targetUserIds: [] };
  }

  const authorDisplayName = commentAuthor.displayName || commentAuthor.name;
  const prTitle = pr.title ? ` ${pr.title}` : "";
  const title = `Bình luận mới trên PR #${pr.id}${prTitle ? `: ${prTitle.trim()}` : ` (${repo})`}`;
  const bodyText = `${authorDisplayName}: ${comment.text.slice(0, 200)}`;
  const link = pr.url || (pr.branch ? `/branches?q=${encodeURIComponent(pr.branch)}` : "/branches");
  const eventKey = `bb-pr-comment:${repo}:${pr.id}:${comment.id}`;

  let notifiedCount = 0;
  for (const userId of targetUserIds) {
    try {
      const res = await notifyUser(userId, {
        type: "comment",
        title,
        body: bodyText,
        link,
        severity: "info",
        eventKey,
      });
      if (res) notifiedCount++;
    } catch {
      /* ignore per-user notification errors */
    }
  }

  return { notifiedCount, targetUserIds: Array.from(targetUserIds) };
}
