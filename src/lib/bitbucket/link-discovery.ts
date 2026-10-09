import { extractJiraKeys } from "./branch-linker";

export type StandardLinkSource =
  | "manual"
  | "explicit"
  | "jira_dev_status"
  | "branch_name"
  | "commit_message"
  | "pr_title"
  | "comment";

export const MANUAL_LINK_SOURCES = new Set<string>(["manual", "explicit"]);

export function isManualLinkSource(source?: string | null): boolean {
  return Boolean(source && MANUAL_LINK_SOURCES.has(source));
}

export const LINK_SOURCE_PRIORITY_ORDER: Record<string, number> = {
  manual: 100,
  explicit: 100,
  jira_dev_status: 80,
  branch_name: 60,
  commit_message: 50,
  pr_title: 40,
  comment: 20,
};

export function getLinkSourcePriority(source?: string | null): number {
  if (!source) return 0;
  return LINK_SOURCE_PRIORITY_ORDER[source] ?? 10;
}

export function isProtectedBranchLinkState(state?: string | null): boolean {
  return state === "manual_unlinked" || state === "rejected";
}

export type LinkCandidate = {
  jiraKey: string;
  linkSource?: string | null;
  linkConfidence?: number | null;
  createdAt?: Date | string | number | null;
  reason?: string | null;
};

/**
 * Rank confirmed links by precedence rules:
 * 1. Manual/explicit sources first (isManualLinkSource)
 * 2. Confidence descending
 * 3. Source priority tier descending
 * 4. CreatedAt ascending (earliest created wins ties)
 */
export function rankConfirmedLinks<T extends LinkCandidate>(links: T[]): T[] {
  return [...links].sort((a, b) => {
    const am = isManualLinkSource(a.linkSource) ? 1 : 0;
    const bm = isManualLinkSource(b.linkSource) ? 1 : 0;
    if (am !== bm) return bm - am;

    const confA = a.linkConfidence ?? 0;
    const confB = b.linkConfidence ?? 0;
    if (confA !== confB) return confB - confA;

    const prioA = getLinkSourcePriority(a.linkSource);
    const prioB = getLinkSourcePriority(b.linkSource);
    if (prioA !== prioB) return prioB - prioA;

    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });
}

/**
 * Select the primary link candidate from a set of confirmed links.
 * Respects stability: if the current primary Jira key is tied for top rank, keep it.
 */
export function selectPrimaryLinkObject<T extends LinkCandidate>(
  links: T[],
  currentPrimaryJiraKey?: string | null
): T | null {
  if (!links || links.length === 0) return null;

  const ranked = rankConfirmedLinks(links);
  const top = ranked[0];
  if (!top) return null;

  if (currentPrimaryJiraKey) {
    const current = ranked.find((l) => l.jiraKey === currentPrimaryJiraKey);
    if (current) {
      const topManual = isManualLinkSource(top.linkSource);
      const currentManual = isManualLinkSource(current.linkSource);
      // Stability: keep current if it matches the top candidate's manual tier and confidence
      if (
        topManual === currentManual &&
        (current.linkConfidence ?? 0) >= (top.linkConfidence ?? 0)
      ) {
        return current;
      }
    }
  }

  return top;
}

/**
 * Convenience helper returning just the Jira key of the primary link.
 */
export function selectPrimaryLink(
  links: LinkCandidate[],
  currentPrimaryJiraKey?: string | null
): string | null {
  return selectPrimaryLinkObject(links, currentPrimaryJiraKey)?.jiraKey ?? null;
}

export type DiscoverBranchLinksOptions = {
  branch: string;
  prTitle?: string | null;
  commitMessages?: string[] | null;
  resolvedPrimary?: {
    jiraKey: string | null;
    linkSource?: string | null;
    linkConfidence?: number | null;
    linkState?: string | null;
  } | null;
  validKeys?: Set<string>;
  maxLinks?: number;
};

export type DiscoveredLink = {
  jiraKey: string;
  source: string;
  confidence: number;
  reason?: string;
};

/**
 * Pure discovery function to find candidate Jira links for a branch across multiple sources
 * (branch name, PR title, commit messages, resolved primary).
 * Deduplicates keys and enforces maximum candidates.
 */
export function discoverBranchLinks(options: DiscoverBranchLinksOptions): DiscoveredLink[] {
  const { branch, prTitle, commitMessages, resolvedPrimary, validKeys, maxLinks = 5 } = options;

  const branchKeys = extractJiraKeys(branch);
  const prKeys = prTitle ? extractJiraKeys(prTitle) : [];

  const wanted = new Map<string, DiscoveredLink>();

  for (const k of branchKeys) {
    if (!validKeys || validKeys.has(k)) {
      wanted.set(k, {
        jiraKey: k,
        source: "branch_name",
        confidence: 95,
        reason: `Found in branch name: ${branch}`,
      });
    }
  }

  for (const k of prKeys) {
    if (!validKeys || validKeys.has(k)) {
      if (!wanted.has(k)) {
        wanted.set(k, {
          jiraKey: k,
          source: "pr_title",
          confidence: 85,
          reason: `Found in PR title: ${prTitle}`,
        });
      }
    }
  }

  if (commitMessages && commitMessages.length > 0) {
    for (const msg of commitMessages) {
      if (!msg) continue;
      const cKeys = extractJiraKeys(msg);
      for (const k of cKeys) {
        if (!validKeys || validKeys.has(k)) {
          if (!wanted.has(k)) {
            wanted.set(k, {
              jiraKey: k,
              source: "commit_message",
              confidence: 80,
              reason: "Found in commit message",
            });
          }
        }
      }
    }
  }

  if (
    resolvedPrimary?.jiraKey &&
    resolvedPrimary.linkState === "confirmed" &&
    !wanted.has(resolvedPrimary.jiraKey)
  ) {
    wanted.set(resolvedPrimary.jiraKey, {
      jiraKey: resolvedPrimary.jiraKey,
      source: resolvedPrimary.linkSource ?? "branch_name",
      confidence: resolvedPrimary.linkConfidence ?? 85,
      reason: "Resolved primary link",
    });
  }

  return Array.from(wanted.values()).slice(0, maxLinks);
}
