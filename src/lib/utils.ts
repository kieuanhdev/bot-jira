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

export { getJiraIssueUrl } from "./jira/urls";

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
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
