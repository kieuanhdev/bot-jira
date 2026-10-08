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

export type BbCommit = {
  id: string;
  displayId?: string;
  message?: string;
  author?: BbUser;
  committer?: BbUser;
  authorTimestamp?: number;
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
  /** Optimistic-lock version, required by Bitbucket when updating a PR. */
  version?: number;
  title?: string;
  description?: string;
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

export async function getSystemBitbucketCreds(): Promise<BbCreds | null> {
  const all = await getAllBitbucketCreds();
  return all[0] ?? null;
}

export async function getAllBitbucketCreds(): Promise<BbCreds[]> {
  const list: BbCreds[] = [];
  if (env.bitbucketToken && env.bitbucketUser) {
    list.push({
      user: env.bitbucketUser,
      token: env.bitbucketToken,
    });
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const { safeDecrypt } = await import("@/lib/crypto");
    const users = await prisma.user.findMany({
      where: { bitbucketTokenEnc: { not: null } },
      orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
      select: { bitbucketUserEnc: true, bitbucketTokenEnc: true },
    });
    for (const user of users) {
      if (user.bitbucketTokenEnc) {
        const token = safeDecrypt(user.bitbucketTokenEnc);
        const username = safeDecrypt(user.bitbucketUserEnc);
        if (token && username && !list.some((c) => c.user === username)) {
          list.push({ user: username, token });
        }
      }
    }
  } catch {
    // DB not available
  }
  return list;
}

const repoCredCache = new Map<string, BbCreds>();

async function request<T>(
  repo: string,
  path: string,
  init: { method?: string; body?: string } = {},
  creds?: BbCreds
): Promise<T> {
  const base = env.bitbucketBaseUrl.replace(/\/$/, "");

  let candidateCreds: BbCreds[] = [];
  if (creds) {
    candidateCreds = [creds];
  } else {
    const cached = repoCredCache.get(repo);
    const all = await getAllBitbucketCreds();
    if (cached) {
      candidateCreds = [cached, ...all.filter((c) => c.user !== cached.user)];
    } else {
      candidateCreds = all;
    }
  }

  if (candidateCreds.length === 0) {
    throw new Error("Chưa cấu hình tài khoản Bitbucket trong hệ thống hoặc thiết lập người dùng");
  }

  let lastError: Error | null = null;
  for (let i = 0; i < candidateCreds.length; i++) {
    const currentCred = candidateCreds[i];
    const basic = Buffer.from(`${currentCred.user}:${currentCred.token}`).toString("base64");
    const url = `${base}/rest/api/1.0/projects/${encodeURIComponent(
      repo.split("/")[0] ?? repo
    )}/repos/${encodeURIComponent(repo.split("/")[1] ?? repo)}/${path}`;

    try {
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
        const err = new Error(`Bitbucket ${path} -> ${res.status}: ${text.slice(0, 300)}`);
        if (isBitbucketPermissionError(err) && i < candidateCreds.length - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }

      if (!creds) {
        repoCredCache.set(repo, currentCred);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      if (isBitbucketPermissionError(e) && i < candidateCreds.length - 1) {
        lastError = e as Error;
        continue;
      }
      throw e;
    }
  }

  throw lastError ?? new Error("Chưa cấu hình tài khoản Bitbucket có quyền truy cập repo này");
}

/** Check if an error from Bitbucket indicates unauthorized / forbidden access. */
export function isBitbucketPermissionError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("-> 401") ||
    msg.includes("-> 403") ||
    msg.includes("AuthorisationException") ||
    msg.includes("not permitted to access this resource") ||
    msg.includes("Authentication failed")
  );
}

type Paged<T> = {
  values: T[];
  isLastPage: boolean;
  limit: number;
  size: number;
  start: number;
};

async function fetchPaged<T>(
  repo: string,
  basePath: string,
  creds?: BbCreds,
  maxPages = 500
): Promise<T[]> {
  const pageSize = 100;
  const out: T[] = [];
  let start = 0;
  for (let page = 0; page < maxPages; page++) {
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

function normalizePullRequest(pullRequest: BitbucketPullRequestResponse): BbPullRequest {
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

export const bitbucket = {
  /**
   * Check a credential against the server itself (not a specific repo), so a
   * token without access to the first configured repo is still accepted.
   * Throws a "-> 401" error only when the username/token pair is rejected.
   */
  async verifyCreds(creds: BbCreds): Promise<void> {
    const base = env.bitbucketBaseUrl.replace(/\/$/, "");
    const basic = Buffer.from(`${creds.user}:${creds.token}`).toString("base64");
    const res = await fetch(`${base}/rest/api/1.0/projects?limit=1`, {
      headers: { Accept: "application/json", Authorization: `Basic ${basic}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Bitbucket projects -> ${res.status}: ${text.slice(0, 300)}`);
    }
  },

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

  async getCommit(
    repo: string,
    commitId: string,
    creds?: BbCreds
  ): Promise<BbCommit | null> {
    try {
      const res = await request<BbCommit>(
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
      const res = await request<Paged<BbCommit>>(
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
      const res = await request<Paged<{ id?: string; displayId?: string }>>(
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

  async listPullRequests(
    repo: string,
    creds?: BbCreds,
    maxPages = 500
  ): Promise<BbPullRequest[]> {
    const pullRequests = await fetchPaged<BitbucketPullRequestResponse>(
      repo,
      "pull-requests?state=ALL",
      creds,
      maxPages
    );
    return pullRequests.map(normalizePullRequest);
  },

  async listOpenPullRequests(repo: string, creds?: BbCreds): Promise<BbPullRequest[]> {
    const pullRequests = await fetchPaged<BitbucketPullRequestResponse>(
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
    await request<unknown>(
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

  repos(): string[] {
    return bitbucketRepoList;
  },
};
