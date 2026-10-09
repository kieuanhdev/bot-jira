import type {
  BbCreds,
  BbPrActivity,
  BbPullRequest,
  BitbucketPullRequestResponse,
} from "../types";
import type { BitbucketTransport } from "../transport";

export function normalizePullRequest(pullRequest: BitbucketPullRequestResponse): BbPullRequest {
  let url: string | undefined;
  if (pullRequest.links?.self) {
    if (Array.isArray(pullRequest.links.self)) {
      url = pullRequest.links.self[0]?.href;
    } else if (typeof pullRequest.links.self === "object" && "href" in pullRequest.links.self) {
      url = (pullRequest.links.self as { href?: string }).href;
    }
  }
  return {
    ...pullRequest,
    url,
    fromRef: {
      branch: pullRequest.fromRef.branch ?? pullRequest.fromRef.displayId ?? "",
    },
    toRef: pullRequest.toRef
      ? { branch: pullRequest.toRef.branch ?? pullRequest.toRef.displayId ?? "" }
      : undefined,
  };
}

export function createPullRequestsResource(transport: BitbucketTransport) {
  return {
    async listPullRequests(
      repo: string,
      creds?: BbCreds,
      maxPages = 500
    ): Promise<BbPullRequest[]> {
      const pullRequests = await transport.fetchPaged<BitbucketPullRequestResponse>(
        repo,
        "pull-requests?state=ALL",
        creds,
        maxPages
      );
      return pullRequests.map(normalizePullRequest);
    },

    async listOpenPullRequests(repo: string, creds?: BbCreds): Promise<BbPullRequest[]> {
      const pullRequests = await transport.fetchPaged<BitbucketPullRequestResponse>(
        repo,
        "pull-requests?state=OPEN",
        creds
      );
      return pullRequests.map(normalizePullRequest);
    },

    async getPullRequest(
      repo: string,
      prId: number,
      creds?: BbCreds
    ): Promise<BbPullRequest | null> {
      try {
        const res = await transport.request<BitbucketPullRequestResponse>(
          repo,
          `pull-requests/${prId}`,
          {},
          creds
        );
        return normalizePullRequest(res);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("404")) return null;
        throw e;
      }
    },

    /** Open a pull request from `from` into `to` (Bitbucket Data Center). */
    async createPullRequest(
      repo: string,
      data: {
        title: string;
        description?: string;
        from: string;
        to: string;
        reviewers?: string[];
      },
      creds?: BbCreds
    ): Promise<BbPullRequest> {
      const [project, slug] = repo.split("/");
      const ref = (branch: string) => ({
        id: `refs/heads/${branch}`,
        repository: { slug: slug ?? repo, project: { key: project ?? repo } },
      });
      const res = await transport.request<BitbucketPullRequestResponse>(
        repo,
        "pull-requests",
        {
          method: "POST",
          body: JSON.stringify({
            title: data.title,
            description: data.description ?? "",
            fromRef: ref(data.from),
            toRef: ref(data.to),
            reviewers: (data.reviewers ?? []).map((name) => ({ user: { name } })),
          }),
        },
        creds
      );
      return normalizePullRequest(res);
    },

    /**
     * Update title/description of a pull request. Bitbucket requires the current
     * `version`; reviewers are re-sent so the update never clears them.
     */
    async updatePullRequest(
      repo: string,
      prId: number,
      data: {
        version: number;
        title: string;
        description?: string;
        reviewers?: { user: { name: string } }[];
      },
      creds?: BbCreds
    ): Promise<void> {
      await transport.request<unknown>(
        repo,
        `pull-requests/${prId}`,
        { method: "PUT", body: JSON.stringify(data) },
        creds
      );
    },

    async listPullRequestActivities(
      repo: string,
      prId: number,
      creds?: BbCreds
    ): Promise<BbPrActivity[]> {
      return transport.fetchPaged<BbPrActivity>(
        repo,
        `pull-requests/${prId}/activities`,
        creds
      );
    },
  };
}
