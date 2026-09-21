import { env, bitbucketRepoList } from "@/lib/env";

export type BbBranch = {
  name: string;
  id?: number;
  latestCommit?: string;
  latestCommitDate?: string;
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

async function request<T>(repo: string, path: string, creds?: BbCreds): Promise<T> {
  const base = env.bitbucketBaseUrl.replace(/\/$/, "");
  const user = creds?.user ?? env.bitbucketUser;
  const token = creds?.token ?? env.bitbucketToken;
  const basic = Buffer.from(`${user}:${token}`).toString("base64");
  const url = `${base}/rest/api/1.0/projects/${encodeURIComponent(
    repo.split("/")[0] ?? repo
  )}/repos/${encodeURIComponent(repo.split("/")[1] ?? repo)}/${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bitbucket ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
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
