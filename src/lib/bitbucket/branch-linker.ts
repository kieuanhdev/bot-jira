/**
 * Pure helper module for resolving Jira tasks from branch names and PR titles.
 * No database or environment dependencies, fully unit testable.
 */

const JIRA_KEY_REGEX = /(?:^|[^A-Za-z0-9]|_)([A-Z][A-Z0-9]+-\d+)(?=[^0-9]|$)/gi;

/**
 * Common prefixes in git branch names and versions that look like Jira keys but are not
 * (e.g. hot-fix-5.9.2 -> FIX-5, release-4.8.1 -> RELEASE-4, fix/api-error-handling-500 -> HANDLING-500).
 */
export const IGNORED_JIRA_PREFIXES = new Set([
  "FIX",
  "HOTFIX",
  "RELEASE",
  "HANDLING",
  "UI",
  "UX",
  "TEST",
  "TESTS",
  "BUG",
  "BUGS",
  "BUILD",
  "TAG",
  "PATCH",
  "VER",
  "VERSION",
  "DOC",
  "DOCS",
  "CHORE",
  "FEAT",
  "FEATURE",
  "REFACTOR",
  "PERF",
  "CI",
  "CD",
  "API",
  "HTTP",
  "HTTPS",
  "WIP",
]);

/**
 * Extract all unique uppercase Jira keys from any text string (e.g. branch name, PR title),
 * filtering out known false-positive version/word prefixes.
 */
export function extractJiraKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  const regex = new RegExp(JIRA_KEY_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      const key = match[1].toUpperCase();
      const prefix = key.split("-")[0];
      if (!IGNORED_JIRA_PREFIXES.has(prefix)) {
        matches.add(key);
      }
    }
  }
  return Array.from(matches);
}

export const SYSTEM_BASE_BRANCHES = new Set([
  "main",
  "master",
  "develop",
  "development",
  "dev",
  "staging",
  "stage",
  "prod",
  "production",
  "test",
  "qa",
  "uat",
]);

export function isSystemOrReleaseBranch(branchName?: string | null): boolean {
  if (!branchName) return true;
  const lower = branchName.toLowerCase().trim();
  if (SYSTEM_BASE_BRANCHES.has(lower)) return true;
  if (/^(release|hotfix|support)[\/-]/i.test(lower)) return true;
  return false;
}

export type BranchLinkState = "confirmed" | "suggested" | "rejected" | "manual_unlinked" | "unlinked";

export type LinkResolutionResult = {
  jiraKey: string | null;
  linkSource:
    | "manual"
    | "explicit"
    | "branch_name"
    | "pr_title"
    | "commit_message"
    | "jira_dev_status"
    | "jira_label"
    | "comment"
    | null;
  linkConfidence: number | null;
  linkState: BranchLinkState;
  suggestedJiraKey: string | null;
  reason?: string;
};

export type ResolveBranchLinkInput = {
  branch: string;
  prTitle?: string | null;
  commitMessages?: string[] | null;
  existingJiraKey?: string | null;
  existingLinkSource?: string | null;
  existingLinkState?: BranchLinkState | string | null;
  validJiraKeys?: Set<string>;
};

/**
 * Resolves Jira key linkage and confidence according to the precedence rules:
 * 1. manual_unlinked / rejected: always preserved, never auto-linked by subsequent sync.
 * 2. manual / explicit: always preserved as confirmed (confidence 100).
 * 3. branch_name: exact key -> auto-linked and confirmed by default (confidence 95).
 * 4. pr_title: exact key -> auto-linked and confirmed by default (confidence 85).
 * 5. commit_message: exact key in commit message -> auto-linked and confirmed (confidence 85).
 * 6. ambiguous candidate keys -> suggested (confidence 0).
 * 7. no candidates -> unlinked.
 */
export function resolveBranchLink(input: ResolveBranchLinkInput): LinkResolutionResult {
  const { branch, prTitle, commitMessages, existingJiraKey, existingLinkSource, existingLinkState, validJiraKeys } = input;

  // 1. If user previously manually unlinked or rejected this branch, do not auto-link again
  if (existingLinkState === "manual_unlinked") {
    return {
      jiraKey: null,
      linkSource: "manual",
      linkConfidence: 0,
      linkState: "manual_unlinked",
      suggestedJiraKey: null,
      reason: "Branch was manually unlinked by user",
    };
  }

  if (existingLinkState === "rejected") {
    return {
      jiraKey: null,
      linkSource: "manual",
      linkConfidence: 0,
      linkState: "rejected",
      suggestedJiraKey: null,
      reason: "Candidate link was rejected by user",
    };
  }

  // 2. Manual or explicit linkage created by user or app creation flow
  if (
    existingJiraKey &&
    (existingLinkSource === "manual" || existingLinkSource === "explicit" || existingLinkState === "confirmed")
  ) {
    return {
      jiraKey: existingJiraKey,
      linkSource: (existingLinkSource as LinkResolutionResult["linkSource"]) ?? "manual",
      linkConfidence: 100,
      linkState: "confirmed",
      suggestedJiraKey: null,
    };
  }

  // 3. Candidate from branch name
  const branchCandidates = extractJiraKeys(branch);

  if (branchCandidates.length === 1) {
    const candidate = branchCandidates[0];
    const isCached = !validJiraKeys || validJiraKeys.has(candidate);
    return {
      jiraKey: candidate,
      linkSource: "branch_name",
      linkConfidence: isCached ? 95 : 90,
      linkState: "confirmed",
      suggestedJiraKey: null,
    };
  } else if (branchCandidates.length > 1) {
    const validCandidates = validJiraKeys
      ? branchCandidates.filter((k) => validJiraKeys.has(k))
      : branchCandidates;

    if (validCandidates.length === 1) {
      return {
        jiraKey: validCandidates[0],
        linkSource: "branch_name",
        linkConfidence: 95,
        linkState: "confirmed",
        suggestedJiraKey: null,
      };
    }
    // Ambiguous: multiple candidate keys in branch name
    return {
      jiraKey: null,
      linkSource: null,
      linkConfidence: 0,
      linkState: "suggested",
      suggestedJiraKey: branchCandidates[0] ?? null,
      reason: `Multiple candidate keys in branch: ${branchCandidates.join(", ")}`,
    };
  }

  // 4. Candidate from PR title (fallback when branch name has no key)
  const prCandidates = extractJiraKeys(prTitle);
  if (prCandidates.length > 0) {
    const validPrCandidates = validJiraKeys
      ? prCandidates.filter((k) => validJiraKeys.has(k))
      : prCandidates;

    if (validPrCandidates.length === 1) {
      return {
        jiraKey: validPrCandidates[0],
        linkSource: "pr_title",
        linkConfidence: 85,
        linkState: "confirmed",
        suggestedJiraKey: null,
        reason: `Auto-linked from PR title "${prTitle}"`,
      };
    } else if (prCandidates.length === 1) {
      return {
        jiraKey: prCandidates[0],
        linkSource: "pr_title",
        linkConfidence: 80,
        linkState: "confirmed",
        suggestedJiraKey: null,
        reason: `Auto-linked from PR title "${prTitle}"`,
      };
    } else {
      // Multiple candidates in PR title
      const picked = validPrCandidates[0] ?? prCandidates[0];
      return {
        jiraKey: picked,
        linkSource: "pr_title",
        linkConfidence: 75,
        linkState: "confirmed",
        suggestedJiraKey: null,
        reason: `Selected from multiple keys in PR title: ${prCandidates.join(", ")}`,
      };
    }
  }

  // 5. Candidate from commit messages (fallback when branch name and PR title have no key)
  if (!isSystemOrReleaseBranch(branch) && commitMessages && commitMessages.length > 0) {
    const commitCandidates: string[] = [];
    for (const msg of commitMessages) {
      if (msg) {
        for (const k of extractJiraKeys(msg)) {
          if (!commitCandidates.includes(k)) {
            commitCandidates.push(k);
          }
        }
      }
    }

    if (commitCandidates.length > 0) {
      const validCommitCandidates = validJiraKeys
        ? commitCandidates.filter((k) => validJiraKeys.has(k))
        : commitCandidates;

      if (validCommitCandidates.length === 1) {
        return {
          jiraKey: validCommitCandidates[0],
          linkSource: "commit_message",
          linkConfidence: 85,
          linkState: "confirmed",
          suggestedJiraKey: null,
          reason: `Auto-linked from commit message containing "${validCommitCandidates[0]}"`,
        };
      } else if (commitCandidates.length === 1) {
        return {
          jiraKey: commitCandidates[0],
          linkSource: "commit_message",
          linkConfidence: 80,
          linkState: "confirmed",
          suggestedJiraKey: null,
          reason: `Auto-linked from commit message containing "${commitCandidates[0]}"`,
        };
      } else {
        const picked = validCommitCandidates[0] ?? commitCandidates[0];
        return {
          jiraKey: picked,
          linkSource: "commit_message",
          linkConfidence: 75,
          linkState: "confirmed",
          suggestedJiraKey: null,
          reason: `Selected from multiple keys in commit messages: ${commitCandidates.join(", ")}`,
        };
      }
    }
  }

  // 6. No candidate found
  return {
    jiraKey: null,
    linkSource: null,
    linkConfidence: null,
    linkState: "unlinked",
    suggestedJiraKey: null,
  };
}
