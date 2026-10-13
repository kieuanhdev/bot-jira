import type { BbUser } from "./types";
import { jiraUsernameAliases } from "@/lib/user-creds";
import { safeDecrypt } from "@/lib/crypto";

export type BranchNotificationMessage = {
  type: "comment" | "pr";
  title: string;
  body: string;
  link: string;
  sourceLink: string;
  sourceType: "git";
  severity: "info" | "warning";
  eventKey: string;
  /** Discord deliveries sharing this group are batched into one message. */
  chatDigestGroup?: string;
};

/** Thread context of a PR comment; omitted when it could not be determined. */
export type PrCommentThread = {
  isReply: boolean;
  /** Everyone who wrote in the thread; required to target a reply precisely. */
  participants?: BbUser[];
};

/**
 * Bitbucket users to notify about a PR comment (the comment author is removed later):
 * - reply: the PR author plus everyone who wrote in that thread;
 * - new comment by someone else: the PR author;
 * - new comment by the PR author: the reviewers;
 * - thread unknown: the PR author plus all reviewers.
 */
export function prCommentCandidates(args: {
  prAuthor?: BbUser;
  reviewers?: BbUser[];
  commentAuthor: BbUser;
  thread?: PrCommentThread;
}): BbUser[] {
  const { prAuthor, reviewers = [], commentAuthor, thread } = args;
  const withAuthor = (users: BbUser[]) => (prAuthor ? [prAuthor, ...users] : users);

  if (thread?.isReply && thread.participants) return withAuthor(thread.participants);
  if (thread && !thread.isReply) {
    if (prAuthor && isSameUser(prAuthor, commentAuthor)) return reviewers;
    return withAuthor([]);
  }
  return withAuthor(reviewers);
}

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
  author: { name?: string; emailAddress?: string; displayName?: string }
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
  baseUrl?: string;
};

/** Build a Bitbucket Data Center PR URL when the webhook omits its self link. */
export function buildBitbucketPrUrl(baseUrl: string | undefined, repo: string, prId: number): string | null {
  const [projectKey, ...repoParts] = repo.split("/").filter(Boolean);
  const repoSlug = repoParts.join("/");
  const base = (baseUrl ?? "").replace(/\/+$/, "");
  if (!base || !projectKey || !repoSlug) return null;
  return `${base}/projects/${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}/pull-requests/${prId}`;
}

/** Format notification payload for a PR comment. */
export function formatPrCommentNotification(
  args: FormatPrCommentNotificationArgs
): BranchNotificationMessage {
  const { repo, pr, comment } = args;
  const authorDisplayName = comment.author.displayName || comment.author.name;
  const prTitle = pr.title ? ` ${pr.title}` : "";
  const title = `Bình luận mới trên PR #${pr.id}${prTitle ? `: ${prTitle.trim()}` : ` (${repo})`}`;
  const bodyText = `${authorDisplayName}: ${comment.text.slice(0, 200)}`;
  const link = pr.branch
    ? `/branches?q=${encodeURIComponent(pr.branch)}`
    : `/branches?repo=${encodeURIComponent(repo)}`;
  const sourceLink = pr.url || buildBitbucketPrUrl(args.baseUrl, repo, pr.id) || link;
  const chatDigestGroup = `bb-pr-comment:${repo}:${pr.id}`;
  const eventKey = `${chatDigestGroup}:${comment.id}`;

  return {
    type: "comment",
    title,
    body: bodyText,
    link,
    sourceLink,
    sourceType: "git",
    severity: "info",
    eventKey,
    chatDigestGroup,
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
  const sourceLink =
    projectKey && repoSlug && cleanBaseUrl
      ? `${cleanBaseUrl}/projects/${projectKey}/repos/${repoSlug}/commits/${commit.id}${
          comment.anchor?.path ? `#${encodeURIComponent(comment.anchor.path)}` : ""
        }`
      : `/branches?repo=${encodeURIComponent(repo)}`;
  const link = `/branches?repo=${encodeURIComponent(repo)}`;

  const chatDigestGroup = `bb-commit-comment:${repo}:${commit.id}`;
  const eventKey = `${chatDigestGroup}:${comment.id}`;

  return {
    type: "comment",
    title,
    body: bodyText,
    link,
    sourceLink,
    sourceType: "git",
    severity: "info",
    eventKey,
    chatDigestGroup,
  };
}

export type FormatUnauthorizedMergeNotificationArgs = {
  repo: string;
  pr: {
    id: number;
    title?: string;
    url?: string;
    fromBranch?: string;
    toBranch?: string;
  };
  actor: {
    name?: string;
    displayName?: string;
    emailAddress?: string;
  };
  jiraKeys?: string[];
  baseUrl?: string;
};

/** Format notification payload when a PR is merged by a non-leader. */
export function formatUnauthorizedMergeNotification(
  args: FormatUnauthorizedMergeNotificationArgs
): BranchNotificationMessage {
  const { repo, pr, actor, jiraKeys } = args;
  const actorDisplayName = actor.displayName || actor.name || "người dùng";
  const title = `PR #${pr.id} vừa được merge bởi ${actorDisplayName} (không phải leader) — ${repo}`;

  const branchesPart = `${pr.fromBranch || "unknown"} → ${pr.toBranch || "unknown"}`;
  const jiraPart = jiraKeys && jiraKeys.length > 0 ? ` [${jiraKeys.join(", ")}]` : "";
  const prTitlePart = pr.title ? `${pr.title}: ` : "";
  const bodyText = `${prTitlePart}${branchesPart}${jiraPart}`.slice(0, 200);

  const branchQuery = pr.fromBranch || pr.toBranch;
  const link = branchQuery
    ? `/branches?q=${encodeURIComponent(branchQuery)}`
    : `/branches?repo=${encodeURIComponent(repo)}`;
  const sourceLink = pr.url || buildBitbucketPrUrl(args.baseUrl, repo, pr.id) || link;

  const eventKey = `bb-pr-merged-nonleader:${repo}:${pr.id}`;

  return {
    type: "pr",
    title,
    body: bodyText,
    link,
    sourceLink,
    sourceType: "git",
    severity: "warning",
    eventKey,
  };
}
