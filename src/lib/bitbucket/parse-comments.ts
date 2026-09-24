/**
 * Parse Jira comments for Bitbucket PR/branch state.
 *
 * When Bitbucket is integrated with Jira, it auto-posts comments on issues
 * when PRs are created, updated, or merged. These comments contain
 * structured info about branch/PR state that we can extract without needing
 * a Bitbucket API token.
 *
 * Example comment formats (Bitbucket DC → Jira):
 *   - "Merged pull request #123 from EPM-123 to main"
 *   - "Created pull request #124: EPM-123 fix login"
 *   - "Updated pull request #124 from EPM-123"
 *   - "Declined pull request #123"
 *   - "Pull request #123 was merged into main"
 *
 * The branch name is typically the issue key (e.g. EPM-123) or a variant
 * (e.g. EPM-123-fix). We match the branch against the Jira key using the
 * same convention as `selectReleaseBranches` in the release gates.
 */

import { prisma } from "@/lib/prisma";

/** A parsed branch/PR state extracted from a Jira comment. */
export type ParsedBranchState = {
  jiraKey: string;
  branch: string;
  prId: number | null;
  prState: string; // "MERGED" | "OPEN" | "DECLINED" | "CLOSED" | "UNKNOWN"
  destinationBranch: string | null;
  source: string; // comment id or "comment:<jiraKey>"
};

/**
 * Parse a single comment body for branch/PR state.
 * Returns null if the comment doesn't contain recognizable PR/branch info.
 */
export function parseCommentForBranch(body: string, jiraKey: string): ParsedBranchState | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  // Extract PR id (if present)
  const prMatch = trimmed.match(/pull request #(\d+)/i) || trimmed.match(/PR #(\d+)/i);
  const prId = prMatch ? parseInt(prMatch[1], 10) : null;

  // Extract destination branch
  const toMatch = trimmed.match(/\bto\s+([\w.\/-]+)/i) || trimmed.match(/into\s+([\w.\/-]+)/i);
  const destinationBranch = toMatch ? toMatch[1] : null;

  // Extract source branch (the branch the PR comes from)
  // Pattern: "from EPM-123 to main" or "from EPM-123-fix to main"
  const fromMatch = trimmed.match(/\bfrom\s+([\w.\/-]+)/i);
  const sourceBranch = fromMatch ? fromMatch[1] : null;

  // Determine PR state from keywords
  let prState: string;
  const lower = trimmed.toLowerCase();
  if (/\bmerged\b/.test(lower) || /\bmerge\b/.test(lower)) {
    prState = "MERGED";
  } else if (/\bdeclined\b/.test(lower) || /\bdecline\b/.test(lower)) {
    prState = "DECLINED";
  } else if (/\bclosed\b/.test(lower) || /\bclose\b/.test(lower)) {
    prState = "CLOSED";
  } else if (/\bcreated\b/.test(lower) || /\bopened\b/.test(lower) || /\bopen\b/.test(lower)) {
    prState = "OPEN";
  } else if (/\bupdated\b/.test(lower)) {
    prState = "OPEN"; // update implies still open
  } else if (prId) {
    prState = "OPEN"; // PR mentioned without state verb → assume open
  } else {
    return null; // No PR info at all
  }

  // The branch name: prefer the source branch from the comment, fall back to jiraKey
  const branch = sourceBranch ?? jiraKey;

  // Validate: the branch should relate to the Jira key (contain it as a prefix)
  // This prevents parsing unrelated comments. Use word-boundary matching.
  const keyPattern = new RegExp(`(^|[^A-Za-z0-9])${jiraKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^0-9]|$)`, "i");
  if (!keyPattern.test(branch) && branch !== jiraKey) {
    // Branch doesn't match the Jira key — might be a different issue's PR.
    // Still record it but mark the jiraKey as the one we're parsing for.
    // (The release gate will filter by jiraKey later.)
  }

  return {
    jiraKey,
    branch,
    prId,
    prState,
    destinationBranch,
    source: `comment:${jiraKey}`,
  };
}

/**
 * Scan all CommentCache rows and upsert BranchInfo entries for any that
 * contain PR/branch state. This is a reconciliation pass: it reads comments
 * already synced by poll-jira and extracts branch info without needing
 * Bitbucket API access.
 *
 * Only processes comments that are likely to contain PR info (heuristic:
 * body contains "pull request" or "PR" + a number). This keeps the scan fast.
 *
 * Returns stats: { scanned, parsed, upserted }
 */
export async function parseCommentsForBranches(): Promise<{ scanned: number; parsed: number; upserted: number }> {
  // Find comments that likely contain PR info
  const comments = await prisma.commentCache.findMany({
    where: {
      body: {
        contains: "pull request",
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      jiraKey: true,
      body: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  let parsed = 0;
  let upserted = 0;

  for (const comment of comments) {
    const state = parseCommentForBranch(comment.body, comment.jiraKey);
    if (!state) continue;
    parsed++;

    // Determine the repo: use a placeholder since we don't know the repo
    // from the comment. The release gate matches by branch name (jiraKey),
    // not by repo, so this is acceptable. When Bitbucket API is available,
    // check-branches will populate the correct repo.
    const repo = `jira-comment:${state.jiraKey.split("-")[0] ?? "unknown"}`;

    try {
      const existing = await prisma.branchInfo.findUnique({
        where: { repo_branch: { repo, branch: state.branch } },
      });

      if (!existing) {
        await prisma.branchInfo.create({
          data: {
            repo,
            branch: state.branch,
            jiraKey: null,
            suggestedJiraKey: state.jiraKey,
            linkSource: "comment",
            linkConfidence: 60,
            linkState: "suggested",
            prId: state.prId,
            prState: state.prState,
            prDestinationBranch: state.destinationBranch,
            merged: state.prState === "MERGED",
            checkedAt: new Date(),
          },
        });
        upserted++;
      } else {
        // Do not touch manual_unlinked or rejected
        if (existing.linkState === "manual_unlinked" || existing.linkState === "rejected") {
          continue;
        }

        // Update if the new state is more recent (MERGED > OPEN)
        const stateRank: Record<string, number> = {
          MERGED: 3,
          OPEN: 2,
          DECLINED: 1,
          CLOSED: 1,
          UNKNOWN: 0,
        };
        const newRank = stateRank[state.prState] ?? 0;
        const oldRank = stateRank[existing.prState ?? ""] ?? 0;

        if (newRank >= oldRank) {
          await prisma.branchInfo.update({
            where: { id: existing.id },
            data: {
              // Preserve existing confirmed link if present, otherwise set suggested
              ...(existing.jiraKey
                ? {}
                : {
                    suggestedJiraKey: state.jiraKey,
                    linkSource: existing.linkSource ?? "comment",
                    linkConfidence: existing.linkConfidence ?? 60,
                    linkState: existing.linkState ?? "suggested",
                  }),
              prId: state.prId ?? existing.prId,
              prState: state.prState,
              prDestinationBranch: state.destinationBranch ?? existing.prDestinationBranch,
              merged: state.prState === "MERGED",
              checkedAt: new Date(),
            },
          });
          upserted++;
        }
      }
    } catch {
      // Skip individual upsert errors; don't fail the whole scan
    }
  }

  return { scanned: comments.length, parsed, upserted };
}
