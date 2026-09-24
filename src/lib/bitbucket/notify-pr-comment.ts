import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { deliverToChat } from "@/lib/notify/chat-delivery";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";
import type { BbUser } from "./client";

export type NotifyPrCommentArgs = {
  repo: string;
  pr: {
    id: number;
    title?: string;
    url?: string;
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
 * Notify the PR author and reviewers about a new comment on a Pull Request.
 * Excludes the comment author.
 * Sends both in-app/push notification and chat (Discord) delivery.
 */
export async function notifyPrComment(args: NotifyPrCommentArgs): Promise<{
  notifiedCount: number;
  targetUserIds: string[];
}> {
  const { repo, pr, comment } = args;
  const commentAuthor = comment.author;

  // Gather candidate recipients: author + reviewers
  const candidates: BbUser[] = [];
  if (pr.author?.user) {
    candidates.push(pr.author.user);
  }
  if (pr.reviewers) {
    for (const r of pr.reviewers) {
      if (r.user) candidates.push(r.user);
    }
  }

  // Filter out candidates that are the comment author
  const filteredCandidates = candidates.filter((c) => !isSameUser(c, commentAuthor));
  if (filteredCandidates.length === 0) {
    return { notifiedCount: 0, targetUserIds: [] };
  }

  // Extract all alias strings and emails
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

  // Find local users matching candidates
  const matchedUsers = await prisma.user.findMany({
    where: {
      OR: [
        { jiraUsername: { in: Array.from(allAliases) } },
        ...(emails.size > 0 ? [{ email: { in: Array.from(emails) } }] : []),
      ],
    },
    select: { id: true, jiraUsername: true, email: true },
  });

  const targetUserIds = new Set<string>();
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

  // Also check if any users have encrypted bitbucket username matching candidate aliases
  try {
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
    /* credential decryption fallback is best-effort */
  }

  if (targetUserIds.size === 0) {
    return { notifiedCount: 0, targetUserIds: [] };
  }

  const authorDisplayName = commentAuthor.displayName || commentAuthor.name;
  const prTitle = pr.title ? ` ${pr.title}` : "";
  const title = `Bình luận mới trên PR #${pr.id}${prTitle ? `: ${prTitle.trim()}` : ` (${repo})`}`;
  const bodyText = `${authorDisplayName}: ${comment.text.slice(0, 200)}`;
  const link = pr.url || "/branches";
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

    // Also queue delivery to chat (Discord)
    await deliverToChat({
      userId,
      type: "comment",
      title: `💬 ${title}`,
      body: bodyText,
      link,
      eventId: `${repo}:${pr.id}:${comment.id}`,
    }).catch(() => null);
  }

  return { notifiedCount, targetUserIds: Array.from(targetUserIds) };
}
