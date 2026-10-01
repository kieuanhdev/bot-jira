import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

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
