import { env, bitbucketRepoList } from "@/lib/env";

export type BbBranch = {
  name: string;
  id?: string | number;
  latestCommit?: string;
  latestCommitDate?: string;
};

export type BbBranchCreateRequest = {
  name: string;
  /** Base branch to branch off from (e.g. "main"). */
  base: string;
};

export type BbBranchCreateResult = {
  branch: { name: string; id?: number };
  displayId?: string;
  message?: string;
};

export type BbUser = {
  name: string;
  displayName?: string;
  emailAddress?: string;
};

export type BbPrComment = {
  id: number;
  text: string;
  author: BbUser;
  createdDate?: number;
  updatedDate?: number;
  comments?: BbPrComment[];
};

export type BbPrActivity = {
  id: number;
  createdDate?: number;
  action: string;
  commentAction?: string;
  user?: BbUser;
  comment?: BbPrComment;
};

export type BbPullRequest = {
  id: number;
  title?: string;
  state?: string;
  fromRef: { branch: string };
  toRef?: { branch: string };
  open?: boolean;
  closed?: boolean;
  links?: { self?: { href?: string }[] | { href?: string } };
  url?: string;
  createdDate?: number;
  updatedDate?: number;
  author?: {
    user: BbUser;
    role?: string;
    approved?: boolean;
  };
  reviewers?: Array<{
    user: BbUser;
    role?: string;
    approved?: boolean;
    status?: string;
  }>;
  participants?: Array<{
    user: BbUser;
    role?: string;
    approved?: boolean;
  }>;
};

type BitbucketBranchResponse = Omit<BbBranch, "name"> & {
  displayId?: string;
  name?: string;
};

type BitbucketPullRequestResponse = Omit<BbPullRequest, "fromRef" | "toRef"> & {
  fromRef: { displayId?: string; branch?: string };
  toRef?: { displayId?: string; branch?: string };
  updatedDate?: number;
};

/** Explicit Bitbucket Basic credentials for one user. */
export type BbCreds = { user: string; token: string };

/** Only these states count as a PR that has been merged. */
const MERGED_STATES = new Set(["MERGED"]);

async function request<T>(
  repo: string,
  path: string,
  init: { method?: string; body?: string } = {},
  creds?: BbCreds
): Promise<T> {
  const base = env.bitbucketBaseUrl.replace(/\/$/, "");
  // Calls without explicit credentials are system-only (workers/health) and
  // maintain the shared read model. Interactive paths always pass user creds.
  const user = creds?.user ?? env.bitbucketUser;
  const token = creds?.token ?? env.bitbucketToken;
  const basic = Buffer.from(`${user}:${token}`).toString("base64");
  const url = `${base}/rest/api/1.0/projects/${encodeURIComponent(
    repo.split("/")[0] ?? repo
  )}/repos/${encodeURIComponent(repo.split("/")[1] ?? repo)}/${path}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bitbucket ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

type Paged<T> = {
  values: T[];
  isLastPage: boolean;
  limit: number;
  size: number;
  start: number;
};

async function fetchPaged<T>(repo: string, basePath: string, creds?: BbCreds): Promise<T[]> {
  const pageSize = 100;
  const out: T[] = [];
  let start = 0;
  for (let page = 0; page < 500; page++) {
    const res = await request<Paged<T>>(
      repo,
      `${basePath}${basePath.includes("?") ? "&" : "?"}start=${start}&limit=${pageSize}`,
      {},
      creds
    );
    out.push(...res.values);
    if (res.isLastPage || res.values.length < pageSize) break;
    start += pageSize;
  }
  return out;
}

export const bitbucket = {
  async listBranches(repo: string, creds?: BbCreds): Promise<BbBranch[]> {
    const branches = await fetchPaged<BitbucketBranchResponse>(repo, "branches", creds);
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
  async getBranch(repo: string, branchName: string, creds?: BbCreds): Promise<BbBranch | null> {
    try {
      const res = await request<BbBranch>(
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
    return request<BbBranchCreateResult>(
      repo,
      "branches",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
      creds
    );
  },

  async listPullRequests(repo: string, creds?: BbCreds): Promise<BbPullRequest[]> {
    const pullRequests = await fetchPaged<BitbucketPullRequestResponse>(
      repo,
      "pull-requests?state=ALL",
      creds
    );
    return pullRequests.map((pullRequest) => {
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
    });
  },

  async listOpenPullRequests(repo: string, creds?: BbCreds): Promise<BbPullRequest[]> {
    const pullRequests = await fetchPaged<BitbucketPullRequestResponse>(
      repo,
      "pull-requests?state=OPEN",
      creds
    );
    return pullRequests.map((pullRequest) => {
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
    });
  },

  async getPullRequest(
    repo: string,
    prId: number,
    creds?: BbCreds
  ): Promise<BbPullRequest | null> {
    try {
      const res = await request<BitbucketPullRequestResponse>(
        repo,
        `pull-requests/${prId}`,
        {},
        creds
      );
      let url: string | undefined;
      if (res.links?.self) {
        if (Array.isArray(res.links.self)) {
          url = res.links.self[0]?.href;
        } else if (typeof res.links.self === "object" && "href" in res.links.self) {
          url = (res.links.self as { href?: string }).href;
        }
      }
      return {
        ...res,
        url,
        fromRef: {
          branch: res.fromRef.branch ?? res.fromRef.displayId ?? "",
        },
        toRef: res.toRef
          ? { branch: res.toRef.branch ?? res.toRef.displayId ?? "" }
          : undefined,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("404")) return null;
      throw e;
    }
  },

  async listPullRequestActivities(
    repo: string,
    prId: number,
    creds?: BbCreds
  ): Promise<BbPrActivity[]> {
    return fetchPaged<BbPrActivity>(
      repo,
      `pull-requests/${prId}/activities`,
      creds
    );
  },

  /**
   * Determine which branches are not merged into the base branch.
   * Only PRs with state MERGED into the configured base branch count.
   * CLOSED and DECLINED are NOT merged.
   */
  async branchStatus(
    repo: string,
    creds?: BbCreds
  ): Promise<
    {
      branch: BbBranch;
      pr?: BbPullRequest;
      merged: boolean;
      prState?: string;
      prDestinationBranch?: string;
      prTitle?: string;
      prUrl?: string;
      prUpdatedAt?: Date;
    }[]
  > {
    const [branches, prs] = await Promise.all([
      this.listBranches(repo, creds),
      this.listPullRequests(repo, creds),
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
        const prMerged =
          prState != null &&
          MERGED_STATES.has(prState) &&
          (prDestinationBranch === base || prDestinationBranch == null);
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

  repos(): string[] {
    return bitbucketRepoList;
  },
};
