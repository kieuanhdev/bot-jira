import type { BbUser } from "./types";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";

export type BranchNotificationMessage = {
  type: "comment";
  title: string;
  body: string;
  link: string;
  severity: "info";
  eventKey: string;
};

/** Normalize username or email for safe comparison. */
export function norm(str?: string | null): string {
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

/** Check if a local user record matches any candidate Bitbucket user. */
export function userMatchesCandidates(
  user: { jiraUsername?: string | null; email?: string | null },
  candidates: BbUser[]
): boolean {
  const uJira = user.jiraUsername ? jiraUsernameAliases(user.jiraUsername) : [];
  const uEmail = norm(user.email);
  return candidates.some((c) => {
    const cAliases = c.name ? jiraUsernameAliases(c.name) : [];
    const hasNameMatch = cAliases.some((ca) => uJira.includes(ca));
    const hasEmailMatch = Boolean(c.emailAddress && norm(c.emailAddress) === uEmail);
    return hasNameMatch || hasEmailMatch;
  });
}

/** Check if a local user matches the comment author (to be excluded). */
export function isUserAuthor(
  user: { jiraUsername?: string | null; email?: string | null; bitbucketUserEnc?: string | null },
  author: BbUser
): boolean {
  const authorAliases = author.name ? jiraUsernameAliases(author.name) : [];
  const uAliases = user.jiraUsername ? jiraUsernameAliases(user.jiraUsername) : [];
  const isAuthorName = authorAliases.some((ca) => uAliases.includes(ca));
  const isAuthorEmail = Boolean(
    author.emailAddress && user.email && norm(author.emailAddress) === norm(user.email)
  );
  let isAuthorDec = false;
  if (user.bitbucketUserEnc) {
    const dec = safeDecrypt(user.bitbucketUserEnc);
    if (dec && authorAliases.some((ca) => jiraUsernameAliases(dec).includes(ca))) {
      isAuthorDec = true;
    }
  }
  return isAuthorName || isAuthorEmail || isAuthorDec;
}

export type FormatPrCommentNotificationArgs = {
  repo: string;
  pr: {
    id: number;
    title?: string;
    url?: string;
    branch?: string;
  };
  comment: {
    id: number;
    text: string;
    author: BbUser;
  };
};

/** Format notification payload for a PR comment. */
export function formatPrCommentNotification(
  args: FormatPrCommentNotificationArgs
): BranchNotificationMessage {
  const { repo, pr, comment } = args;
  const authorDisplayName = comment.author.displayName || comment.author.name;
  const prTitle = pr.title ? ` ${pr.title}` : "";
  const title = `Bình luận mới trên PR #${pr.id}${prTitle ? `: ${prTitle.trim()}` : ` (${repo})`}`;
  const bodyText = `${authorDisplayName}: ${comment.text.slice(0, 200)}`;
  const link = pr.url || (pr.branch ? `/branches?q=${encodeURIComponent(pr.branch)}` : "/branches");
  const eventKey = `bb-pr-comment:${repo}:${pr.id}:${comment.id}`;

  return {
    type: "comment",
    title,
    body: bodyText,
    link,
    severity: "info",
    eventKey,
  };
}

export type FormatCommitCommentNotificationArgs = {
  repo: string;
  commit: {
    id: string;
    message?: string;
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
  baseUrl?: string;
};

/** Format notification payload for a commit comment. */
export function formatCommitCommentNotification(
  args: FormatCommitCommentNotificationArgs
): BranchNotificationMessage {
  const { repo, commit, comment, baseUrl } = args;
  const shortSha = commit.id.slice(0, 10);
  const commitMessage = commit.message ?? "";
  const firstLine = commitMessage.split("\n")[0]?.trim();
  const commitSuffix = firstLine ? `: ${firstLine.slice(0, 80)}` : "";
  const title = `Bình luận mới trên commit [${shortSha}]${commitSuffix} (${repo})`;
  const authorDisplayName = comment.author.displayName || comment.author.name;
  const pathInfo = comment.anchor?.path
    ? ` (${comment.anchor.path}${comment.anchor.line ? `:${comment.anchor.line}` : ""})`
    : "";
  const bodyText = `${authorDisplayName}${pathInfo}: ${comment.text.slice(0, 200)}`;

  const [projectKey, repoSlug] = repo.split("/");
  const cleanBaseUrl = (baseUrl || "").replace(/\/+$/, "");
  const link =
    projectKey && repoSlug && cleanBaseUrl
      ? `${cleanBaseUrl}/projects/${projectKey}/repos/${repoSlug}/commits/${commit.id}${
          comment.anchor?.path ? `#${encodeURIComponent(comment.anchor.path)}` : ""
        }`
      : "/branches";

  const eventKey = `bb-commit-comment:${repo}:${commit.id}:${comment.id}`;

  return {
    type: "comment",
    title,
    body: bodyText,
    link,
    severity: "info",
    eventKey,
  };
}
