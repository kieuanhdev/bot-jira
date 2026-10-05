import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getSystemJiraAuth, jiraWith, type JiraAuth, JiraRequestError } from "./client";

export type JiraDevStatusPullRequest = {
  id: string; // e.g. "#727"
  name?: string;
  url?: string;
  status?: string; // "MERGED" | "OPEN" | "DECLINED"
  author?: { name?: string; displayName?: string };
  source?: { branch?: string; url?: string };
  destination?: { branch?: string; url?: string };
  repository?: { name?: string; url?: string };
};

export type JiraDevStatusBranch = {
  name: string;
  url?: string;
  createPullRequestUrl?: string;
  repository?: { name?: string; url?: string };
};

export type JiraDevStatusDetailResult = {
  branches: JiraDevStatusBranch[];
  pullRequests: JiraDevStatusPullRequest[];
};

/**
 * Extract Bitbucket / Git repository slug (e.g. "CICB/mobile-cic-2021") from a URL.
 * Handles Bitbucket Server URLs such as:
 * - https://git-sds.softdreams.vn:7990/projects/CICB/repos/mobile-cic-2021/pull-requests/727
 * - https://git-sds.softdreams.vn:7990/projects/CICB/repos/mobile-cic-2021/browse
 * - https://git-sds.softdreams.vn:7990/scm/cicb/mobile-cic-2021.git
 */
export function extractRepoSlugFromUrl(url?: string | null): string | null {
  if (!url) return null;
  const projectRepoMatch = url.match(/\/projects\/([^\/]+)\/repos\/([^\/]+)/i);
  if (projectRepoMatch && projectRepoMatch[1] && projectRepoMatch[2]) {
    return `${projectRepoMatch[1].toUpperCase()}/${projectRepoMatch[2]}`;
  }
  const scmMatch = url.match(/\/scm\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:$|[?\/])/i);
  if (scmMatch && scmMatch[1] && scmMatch[2]) {
    return `${scmMatch[1].toUpperCase()}/${scmMatch[2]}`;
  }
  return null;
}

/**
 * Parse numeric PR ID from string like "#727" or "727".
 */
export function parsePrId(rawId?: string | null): number | null {
  if (!rawId) return null;
  const num = parseInt(rawId.replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Call Jira Dev Status API detail endpoint for a given issue numerical ID.
 */
export async function fetchJiraDevStatusDetail(
  issueId: string,
  auth?: JiraAuth,
  timeoutMs: number = 10000
): Promise<JiraDevStatusDetailResult> {
  const effectiveAuth = auth || (await getSystemJiraAuth());
  if (!effectiveAuth || !effectiveAuth.token) {
    throw new JiraRequestError(
      "Chưa cấu hình tài khoản Jira trong hệ thống hoặc thiết lập người dùng",
      401,
      false
    );
  }

  const base = env.jiraBaseUrl.replace(/\/$/, "");
  const authHeader =
    effectiveAuth.authMode === "basic"
      ? `Basic ${Buffer.from(`${effectiveAuth.user}:${effectiveAuth.token}`).toString("base64")}`
      : `Bearer ${effectiveAuth.token}`;

  const headers = {
    Accept: "application/json",
    Authorization: authHeader,
  };

  const fetchWithTimeout = async (path: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        headers,
        signal: controller.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // Fetch pull requests and branches in parallel for stash (Bitbucket Server)
  const [prData, branchData] = await Promise.all([
    fetchWithTimeout(
      `/rest/dev-status/1.0/issue/detail?issueId=${encodeURIComponent(issueId)}&applicationType=stash&dataType=pullrequest`
    ),
    fetchWithTimeout(
      `/rest/dev-status/1.0/issue/detail?issueId=${encodeURIComponent(issueId)}&applicationType=stash&dataType=branch`
    ),
  ]);

  const pullRequests: JiraDevStatusPullRequest[] = [];
  const branches: JiraDevStatusBranch[] = [];

  if (prData && Array.isArray(prData.detail)) {
    for (const group of prData.detail) {
      if (Array.isArray(group.pullRequests)) {
        pullRequests.push(...group.pullRequests);
      }
      if (Array.isArray(group.branches)) {
        branches.push(...group.branches);
      }
    }
  }

  if (branchData && Array.isArray(branchData.detail)) {
    for (const group of branchData.detail) {
      if (Array.isArray(group.branches)) {
        for (const b of group.branches) {
          if (!branches.some((existing) => existing.name === b.name)) {
            branches.push(b);
          }
        }
      }
      if (Array.isArray(group.pullRequests)) {
        for (const p of group.pullRequests) {
          if (!pullRequests.some((existing) => existing.id === p.id)) {
            pullRequests.push(p);
          }
        }
      }
    }
  }

  return { branches, pullRequests };
}

export type SyncedBranchResult = {
  repo: string;
  branch: string;
  prId?: number | null;
  prTitle?: string | null;
  prUrl?: string | null;
  prState?: string | null;
  prDestinationBranch?: string | null;
  merged: boolean;
};

/**
 * Fetch and synchronize Jira Dev Status branches/PRs into the BranchInfo table for a single Jira task.
 */
export async function syncJiraDevStatusForIssue(
  jiraKey: string,
  auth?: JiraAuth
): Promise<{ ok: boolean; syncedBranches: SyncedBranchResult[]; error?: string }> {
  try {
    const effectiveAuth = auth || (await getSystemJiraAuth());
    if (!effectiveAuth) {
      return { ok: false, syncedBranches: [], error: "Không tìm thấy thông tin đăng nhập Jira" };
    }

    const jira = jiraWith(effectiveAuth);

    // Get issue id from Jira
    let issueId: string | null = null;
    try {
      const issue = await jira.getIssue(jiraKey, "id");
      issueId = issue.id;
    } catch (err) {
      return { ok: false, syncedBranches: [], error: `Không thể tìm thấy task ${jiraKey} trên Jira: ${(err as Error).message}` };
    }

    if (!issueId) {
      return { ok: false, syncedBranches: [], error: `Không tìm thấy ID của task ${jiraKey}` };
    }

    const devStatus = await fetchJiraDevStatusDetail(issueId, effectiveAuth);
    const syncedBranches: SyncedBranchResult[] = [];
    const now = new Date();

    // 1. Process Pull Requests first (they contain richer info: state, destination, PR link)
    for (const pr of devStatus.pullRequests) {
      const branchName = pr.source?.branch;
      if (!branchName) continue;

      let repo = extractRepoSlugFromUrl(pr.url) || extractRepoSlugFromUrl(pr.repository?.url);
      if (!repo) {
        // Fallback: derive project from issue key + repo name
        const proj = jiraKey.split("-")[0];
        repo = pr.repository?.name ? `${proj}/${pr.repository.name}` : `${proj}/unknown`;
      }

      const prId = parsePrId(pr.id);
      const prState = (pr.status || "OPEN").toUpperCase();
      const merged = prState === "MERGED";
      const prDestinationBranch = pr.destination?.branch ?? null;
      const prTitle = pr.name ?? null;
      const prUrl = pr.url ?? null;

      // Upsert into BranchInfo with confirmed status
      await prisma.branchInfo.upsert({
        where: { repo_branch: { repo, branch: branchName } },
        update: {
          jiraKey,
          prId,
          prTitle,
          prUrl,
          prState,
          prDestinationBranch,
          merged,
          linkSource: "jira_dev_status",
          linkConfidence: 100,
          linkState: "confirmed",
          deletedAt: null,
          checkedAt: now,
        },
        create: {
          repo,
          branch: branchName,
          jiraKey,
          prId,
          prTitle,
          prUrl,
          prState,
          prDestinationBranch,
          merged,
          linkSource: "jira_dev_status",
          linkConfidence: 100,
          linkState: "confirmed",
          checkedAt: now,
        },
      });

      syncedBranches.push({
        repo,
        branch: branchName,
        prId,
        prTitle,
        prUrl,
        prState,
        prDestinationBranch,
        merged,
      });
    }

    // 2. Process Branches that do not yet have a PR
    for (const b of devStatus.branches) {
      const branchName = b.name;
      if (!branchName) continue;

      // If already processed via PR, skip
      if (syncedBranches.some((s) => s.branch === branchName)) continue;

      let repo = extractRepoSlugFromUrl(b.url) || extractRepoSlugFromUrl(b.repository?.url);
      if (!repo) {
        const proj = jiraKey.split("-")[0];
        repo = b.repository?.name ? `${proj}/${b.repository.name}` : `${proj}/unknown`;
      }

      await prisma.branchInfo.upsert({
        where: { repo_branch: { repo, branch: branchName } },
        update: {
          jiraKey,
          linkSource: "jira_dev_status",
          linkConfidence: 100,
          linkState: "confirmed",
          deletedAt: null,
          checkedAt: now,
        },
        create: {
          repo,
          branch: branchName,
          jiraKey,
          linkSource: "jira_dev_status",
          linkConfidence: 100,
          linkState: "confirmed",
          checkedAt: now,
        },
      });

      syncedBranches.push({
        repo,
        branch: branchName,
        merged: false,
      });
    }

    return { ok: true, syncedBranches };
  } catch (err) {
    return { ok: false, syncedBranches: [], error: (err as Error).message };
  }
}
