/**
 * Pure helper module for resolving Jira tasks from branch names and PR titles.
 * No database or environment dependencies, fully unit testable.
 */

const JIRA_KEY_REGEX = /(?:^|[^A-Za-z0-9])([A-Z][A-Z0-9_]+-\d+)(?=[^0-9]|$)/gi;

/**
 * Extract all unique uppercase Jira keys from any text string (e.g. branch name, PR title).
 */
export function extractJiraKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = new Set<string>();
  const regex = new RegExp(JIRA_KEY_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.add(match[1].toUpperCase());
    }
  }
  return Array.from(matches);
}

export type BranchLinkState = "confirmed" | "suggested" | "rejected" | "manual_unlinked" | "unlinked";

export type LinkResolutionResult = {
  jiraKey: string | null;
  linkSource: "manual" | "explicit" | "branch_name" | "pr_title" | "jira_label" | "comment" | null;
  linkConfidence: number | null;
  linkState: BranchLinkState;
  suggestedJiraKey: string | null;
  reason?: string;
};

export type ResolveBranchLinkInput = {
  branch: string;
  prTitle?: string | null;
  existingJiraKey?: string | null;
  existingLinkSource?: string | null;
  existingLinkState?: BranchLinkState | string | null;
  validJiraKeys?: Set<string>;
};

/**
 * Resolves Jira key linkage and confidence according to the precedence rules:
 * 1. manual_unlinked / rejected: always preserved, never auto-linked by subsequent sync.
 * 2. manual / explicit: always preserved as confirmed (confidence 100).
 * 3. branch_name: exact key matching in IssueCache -> auto-link confirmed (confidence 95).
 * 4. pr_title: exact key matching in IssueCache -> suggested (confidence 80).
 * 5. ambiguous or key not in cache -> unlinked or suggested with confidence 0.
 */
export function resolveBranchLink(input: ResolveBranchLinkInput): LinkResolutionResult {
  const { branch, prTitle, existingJiraKey, existingLinkSource, existingLinkState, validJiraKeys } = input;

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
    const isValid = !validJiraKeys || validJiraKeys.has(candidate);
    if (isValid) {
      return {
        jiraKey: candidate,
        linkSource: "branch_name",
        linkConfidence: 95,
        linkState: "confirmed",
        suggestedJiraKey: null,
      };
    } else {
      // Found key in branch name, but not found in active Jira cache
      return {
        jiraKey: null,
        linkSource: null,
        linkConfidence: 0,
        linkState: "suggested",
        suggestedJiraKey: candidate,
        reason: `Key ${candidate} not found in Jira cache`,
      };
    }
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
    // Ambiguous
    return {
      jiraKey: null,
      linkSource: null,
      linkConfidence: 0,
      linkState: "suggested",
      suggestedJiraKey: branchCandidates[0] ?? null,
      reason: `Multiple candidate keys in branch: ${branchCandidates.join(", ")}`,
    };
  }

  // 4. Fallback to PR title
  const prCandidates = extractJiraKeys(prTitle);
  if (prCandidates.length > 0) {
    const validPrCandidates = validJiraKeys
      ? prCandidates.filter((k) => validJiraKeys.has(k))
      : prCandidates;

    if (validPrCandidates.length === 1) {
      return {
        jiraKey: null,
        linkSource: "pr_title",
        linkConfidence: 80,
        linkState: "suggested",
        suggestedJiraKey: validPrCandidates[0],
        reason: `Suggested from PR title "${prTitle}"`,
      };
    } else if (validPrCandidates.length > 1) {
      return {
        jiraKey: null,
        linkSource: null,
        linkConfidence: 0,
        linkState: "suggested",
        suggestedJiraKey: validPrCandidates[0],
        reason: `Multiple candidate keys in PR title: ${prCandidates.join(", ")}`,
      };
    } else {
      return {
        jiraKey: null,
        linkSource: null,
        linkConfidence: 0,
        linkState: "suggested",
        suggestedJiraKey: prCandidates[0],
        reason: `PR title candidate ${prCandidates[0]} not in Jira cache`,
      };
    }
  }

  // 5. No candidate found
  return {
    jiraKey: null,
    linkSource: null,
    linkConfidence: null,
    linkState: "unlinked",
    suggestedJiraKey: null,
  };
}
