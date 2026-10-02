import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";
import { extractJiraKeys } from "./branch-linker";
import { bitbucket, getSystemBitbucketCreds, type BbUser, type BbCommit } from "./client";
import { env } from "@/lib/env";

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

function norm(str?: string | null): string {
  return (str ?? "").trim().toLowerCase();
}

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
  const commentAuthor = comment.author;

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

  const targetUserIds = new Set<string>();
  const candidates: BbUser[] = [];
  if (commitAuthor) candidates.push(commitAuthor);
  if (fullCommit?.committer) candidates.push(fullCommit.committer);

  // Match candidate Bitbucket users to local bot-jira users
  const filteredCandidates = candidates.filter((c) => {
    const isSameName = Boolean(
      c.name &&
        commentAuthor.name &&
        jiraUsernameAliases(c.name).some((a) =>
          jiraUsernameAliases(commentAuthor.name).includes(a)
        )
    );
    const isSameEmail = Boolean(
      c.emailAddress &&
        commentAuthor.emailAddress &&
        norm(c.emailAddress) === norm(commentAuthor.emailAddress)
    );
    return !isSameName && !isSameEmail;
  });

  if (filteredCandidates.length > 0) {
    const allAliases = new Set<string>();
    const emails = new Set<string>();
    for (const c of filteredCandidates) {
      if (c.name) {
        for (const a of jiraUsernameAliases(c.name)) allAliases.add(a);
      }
      if (c.emailAddress) emails.add(c.emailAddress.trim());
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
        const matches = filteredCandidates.some((c) => {
          const cAliases = c.name ? jiraUsernameAliases(c.name) : [];
          return (
            cAliases.some((ca) => uJira.includes(ca)) ||
            Boolean(c.emailAddress && norm(c.emailAddress) === uEmail)
          );
        });
        if (matches) targetUserIds.add(u.id);
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
          if (decAliases.some((a) => allAliases.has(a))) targetUserIds.add(u.id);
        }
      }
    } catch {
      /* user matching fallback */
    }
  }

  // Linked Jira tasks from commit message
  const jiraKeys = new Set<string>(extractJiraKeys(commitMessage));
  if (jiraKeys.size > 0) {
    const keys = Array.from(jiraKeys);
    try {
      if (prisma.issueCache) {
        const issues = await prisma.issueCache.findMany({
          where: { jiraKey: { in: keys } },
          select: { jiraKey: true, assigneeJira: true },
        });
        const assigneeAliases = new Set<string>();
        for (const i of issues) {
          if (i.assigneeJira) {
            for (const a of jiraUsernameAliases(i.assigneeJira)) assigneeAliases.add(a);
          }
        }
        if (assigneeAliases.size > 0) {
          const assignees = await prisma.user.findMany({
            where: { jiraUsername: { in: Array.from(assigneeAliases) } },
            select: { id: true },
          });
          for (const u of assignees) targetUserIds.add(u.id);
        }
      }
    } catch {
      /* fallback */
    }

    try {
      if (prisma.watch) {
        const watchers = await prisma.watch.findMany({
          where: { jiraKey: { in: keys } },
          select: { userId: true },
        });
        for (const w of watchers) targetUserIds.add(w.userId);
      }
    } catch {
      /* fallback */
    }
  }

  // Strictly exclude comment author
  if (targetUserIds.size > 0) {
    try {
      const usersToVerify = await prisma.user.findMany({
        where: { id: { in: Array.from(targetUserIds) } },
        select: { id: true, jiraUsername: true, email: true, bitbucketUserEnc: true },
      });
      const commentAuthorAliases = commentAuthor.name
        ? jiraUsernameAliases(commentAuthor.name)
        : [];
      for (const u of usersToVerify) {
        const uAliases = u.jiraUsername ? jiraUsernameAliases(u.jiraUsername) : [];
        const isAuthorName = commentAuthorAliases.some((ca) => uAliases.includes(ca));
        const isAuthorEmail = Boolean(
          commentAuthor.emailAddress &&
            u.email &&
            norm(commentAuthor.emailAddress) === norm(u.email)
        );
        let isAuthorDec = false;
        if (u.bitbucketUserEnc) {
          const dec = safeDecrypt(u.bitbucketUserEnc);
          if (dec && commentAuthorAliases.some((ca) => jiraUsernameAliases(dec).includes(ca)))
            isAuthorDec = true;
        }
        if (isAuthorName || isAuthorEmail || isAuthorDec) targetUserIds.delete(u.id);
      }
    } catch {
      /* fallback */
    }
  }

  if (targetUserIds.size === 0) {
    return { notifiedCount: 0, targetUserIds: [] };
  }

  const shortSha = rawCommit.id.slice(0, 10);
  const firstLine = commitMessage.split("\n")[0]?.trim();
  const commitSuffix = firstLine ? `: ${firstLine.slice(0, 80)}` : "";
  const title = `Bình luận mới trên commit [${shortSha}]${commitSuffix} (${repo})`;
  const authorDisplayName = commentAuthor.displayName || commentAuthor.name;
  const pathInfo = comment.anchor?.path
    ? ` (${comment.anchor.path}${comment.anchor.line ? `:${comment.anchor.line}` : ""})`
    : "";
  const bodyText = `${authorDisplayName}${pathInfo}: ${comment.text.slice(0, 200)}`;

  const [projectKey, repoSlug] = repo.split("/");
  const baseUrl = (env.bitbucketBaseUrl || "").replace(/\/+$/, "");
  const link =
    projectKey && repoSlug && baseUrl
      ? `${baseUrl}/projects/${projectKey}/repos/${repoSlug}/commits/${rawCommit.id}${
          comment.anchor?.path ? `#${encodeURIComponent(comment.anchor.path)}` : ""
        }`
      : "/branches";

  const eventKey = `bb-commit-comment:${repo}:${rawCommit.id}:${comment.id}`;

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
