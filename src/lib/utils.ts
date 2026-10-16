import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export {
  timeAgo,
  formatDateTime,
  formatDate,
  formatRelative,
  formatDuration,
} from "./format/time";
export { formatNumber, formatPercent } from "./format/number";

/**
 * Build Jira deep link to view an issue.
 */
export function getJiraIssueUrl(jiraBaseUrl?: string | null, jiraKey?: string | null): string | null {
  if (!jiraBaseUrl || !jiraKey) return null;
  const base = jiraBaseUrl.replace(/\/$/, "");
  return `${base}/browse/${encodeURIComponent(jiraKey)}`;
}

/**
 * Build Bitbucket deep link to view a branch.
 * Falls back to extracting repo base from prUrl if bitbucketBaseUrl is absent.
 */
export function getBitbucketBranchUrl(
  repo: string,
  branch: string,
  bitbucketBaseUrl?: string | null,
  prUrl?: string | null
): string | null {
  if (prUrl) {
    const repoBase = prUrl.split("/pull-requests/")[0];
    if (repoBase) {
      return `${repoBase}/browse?at=refs%2Fheads%2F${encodeURIComponent(branch)}`;
    }
  }
  if (!bitbucketBaseUrl) return null;
  const base = bitbucketBaseUrl.replace(/\/$/, "");
  const parts = repo.split("/");
  if (parts.length >= 2) {
    const project = parts[0];
    const repoName = parts.slice(1).join("/");
    return `${base}/projects/${encodeURIComponent(project)}/repos/${encodeURIComponent(repoName)}/browse?at=refs%2Fheads%2F${encodeURIComponent(branch)}`;
  }
  return `${base}/projects/${encodeURIComponent(repo)}/repos/${encodeURIComponent(repo)}/browse?at=refs%2Fheads%2F${encodeURIComponent(branch)}`;
}

/**
 * Browser-safe UUID generator that works in insecure contexts (such as HTTP on a LAN IP).
 * Native `crypto.randomUUID` is only available in Secure Contexts (HTTPS/localhost).
 */
export function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
