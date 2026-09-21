import { env, bitbucketRepoList } from "@/lib/env";

export type BbBranch = {
  name: string;
  id?: number;
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

export type BbPullRequest = {
  id: number;
  title?: string;
  state?: string;
  fromRef: { branch: string };
  toRef?: { branch: string };
  open?: boolean;
  closed?: boolean;
  links?: { self?: { href?: string } };
};

/** Per-user Bitbucket Basic creds. Pass null to use the shared env token. */
export type BbCreds = { user: string; token: string } | null;

/** Only these states count as a PR that has been merged. */
const MERGED_STATES = new Set(["MERGED"]);

async function request<T>(
  repo: string,
  path: string,
  init: { method?: string; body?: string } = {},
  creds?: BbCreds
): Promise<T> {
  const base = env.bitbucketBaseUrl.replace(/\/$/, "");
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
      `${basePath}&start=${start}&limit=${pageSize}`,
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
    return fetchPaged<BbBranch>(repo, "branches", creds);
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
    return fetchPaged<BbPullRequest>(repo, "pull-requests", creds);
  },

  /**
   * Determine which branches are not merged into the base branch.
   * Only PRs with state MERGED into the configured base branch count.
   * CLOSED and DECLINED are NOT merged.
   */
  async branchStatus(
    repo: string,
    creds?: BbCreds
  ): Promise<{ branch: BbBranch; pr?: BbPullRequest; merged: boolean; prState?: string; prDestinationBranch?: string }[]> {
    const [branches, prs] = await Promise.all([
      this.listBranches(repo, creds),
      this.listPullRequests(repo, creds),
    ]);
    const base = env.bitbucketBaseBranch;

    return branches
      .filter((b) => b.name !== base)
      .map((b) => {
        const pr = prs.find((p) => p.fromRef.branch === b.name);
        const prState = pr?.state;
        const prDestinationBranch = pr?.toRef?.branch;
        const prMerged =
          prState != null &&
          MERGED_STATES.has(prState) &&
          (prDestinationBranch === base || prDestinationBranch == null);
        return { branch: b, pr, merged: prMerged, prState, prDestinationBranch };
      });
  },

  repos(): string[] {
    return bitbucketRepoList;
  },
};
