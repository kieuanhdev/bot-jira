import { env } from "@/lib/env";
import type {
  BbBranch,
  BbBranchCreateRequest,
  BbBranchCreateResult,
  BbCommit,
  BbCreds,
  BbPullRequest,
  BitbucketBranchResponse,
  BranchStatusItem,
  Paged,
} from "../types";
import type { BitbucketTransport } from "../transport";
import { createPullRequestsResource } from "./pull-requests";

const MERGED_STATES = new Set(["MERGED"]);

export function createBranchesResource(
  transport: BitbucketTransport,
  options?: {
    listPullRequests?: (repo: string, creds?: BbCreds) => Promise<BbPullRequest[]>;
  }
) {
  const getPullRequests =
    options?.listPullRequests ??
    (async (repo: string, creds?: BbCreds) => {
      const prResource = createPullRequestsResource(transport);
      return prResource.listPullRequests(repo, creds);
    });

  return {
    async listBranches(repo: string, creds?: BbCreds): Promise<BbBranch[]> {
      const branches = await transport.fetchPaged<BitbucketBranchResponse>(
        repo,
        "branches",
        creds
      );
      return branches
        .map((branch) => ({
          ...branch,
          name: branch.name ?? branch.displayId ?? "",
        }))
        .filter((branch) => branch.name !== "");
    },

    /**
     * Check whether a single branch exists in the repo. Returns null when the
     * branch does not exist (404). Used by the bulk branch-creation action to
     * make create idempotent: we skip branches that are already there.
     */
    async getBranch(
      repo: string,
      branchName: string,
      creds?: BbCreds
    ): Promise<BbBranch | null> {
      try {
        const res = await transport.request<BbBranch>(
          repo,
          `branches/${encodeURIComponent(branchName)}`,
          {},
          creds
        );
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Bitbucket DC returns 404 when the branch does not exist.
        if (msg.includes("404")) return null;
        throw e;
      }
    },

    /**
     * Create a new branch from the given base branch. Returns the created
     * branch. Throws when the branch already exists (409) — callers should check
     * with getBranch first to make this idempotent.
     */
    async createBranch(
      repo: string,
      data: BbBranchCreateRequest,
      creds?: BbCreds
    ): Promise<BbBranchCreateResult> {
      return transport.request<BbBranchCreateResult>(
        repo,
        "branches",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
        creds
      );
    },

    async getCommit(
      repo: string,
      commitId: string,
      creds?: BbCreds
    ): Promise<BbCommit | null> {
      try {
        const res = await transport.request<BbCommit>(
          repo,
          `commits/${encodeURIComponent(commitId)}`,
          {},
          creds
        );
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404")) return null;
        throw e;
      }
    },

    /**
     * Fetch recent commits on a specific branch or commit reference.
     */
    async listCommits(
      repo: string,
      branchOrRef: string,
      limit = 10,
      creds?: BbCreds
    ): Promise<BbCommit[]> {
      try {
        const res = await transport.request<Paged<BbCommit>>(
          repo,
          `commits?until=${encodeURIComponent(branchOrRef)}&limit=${limit}`,
          {},
          creds
        );
        return res?.values ?? [];
      } catch {
        return [];
      }
    },

    /**
     * Find branches containing a specific commit SHA in Bitbucket Server.
     * Endpoint: /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/commits/{commitId}/branches
     */
    async getCommitBranches(
      repo: string,
      commitId: string,
      creds?: BbCreds
    ): Promise<string[]> {
      try {
        const res = await transport.request<Paged<{ id?: string; displayId?: string }>>(
          repo,
          `commits/${encodeURIComponent(commitId)}/branches`,
          {},
          creds
        );
        return (res?.values ?? [])
          .map((b) => b.displayId || b.id?.replace(/^refs\/heads\//, "") || "")
          .filter(Boolean);
      } catch {
        return [];
      }
    },

    /** Default branch of a repo, or null when it cannot be determined. */
    async getDefaultBranch(repo: string, creds?: BbCreds): Promise<string | null> {
      try {
        const res = await transport.request<{ displayId?: string; id?: string }>(
          repo,
          "branches/default",
          {},
          creds
        );
        return res?.displayId ?? res?.id?.replace(/^refs\/heads\//, "") ?? null;
      } catch {
        return null;
      }
    },

    /**
     * Determine which branches are not merged into the base branch.
     * Only PRs with state MERGED into the configured base branch count.
     * CLOSED and DECLINED are NOT merged.
     */
    async branchStatus(
      repo: string,
      creds?: BbCreds
    ): Promise<BranchStatusItem[]> {
      const [branches, prs] = await Promise.all([
        this.listBranches(repo, creds),
        getPullRequests(repo, creds),
      ]);
      const base = env.bitbucketBaseBranch;

      return branches
        .filter((b) => b.name !== base)
        .map((b) => {
          const matchingPrs = prs.filter((p) => p.fromRef.branch === b.name);
          matchingPrs.sort((a, bPr) => (bPr.updatedDate ?? bPr.id) - (a.updatedDate ?? a.id));
          const pr = matchingPrs[0];
          const prState = pr?.state;
          const prDestinationBranch = pr?.toRef?.branch;
          const prMerged = prState != null && MERGED_STATES.has(prState);
          return {
            branch: b,
            pr,
            merged: prMerged,
            prState,
            prDestinationBranch,
            prTitle: pr?.title,
            prUrl: pr?.url,
            prUpdatedAt: pr?.updatedDate ? new Date(pr.updatedDate) : undefined,
          };
        });
    },
  };
}
