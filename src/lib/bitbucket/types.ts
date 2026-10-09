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

export type BitbucketBranchResponse = Omit<BbBranch, "name"> & {
  displayId?: string;
  name?: string;
};

export type BitbucketPullRequestResponse = Omit<BbPullRequest, "fromRef" | "toRef"> & {
  fromRef: { displayId?: string; branch?: string };
  toRef?: { displayId?: string; branch?: string };
  updatedDate?: number;
};

/** Explicit Bitbucket Basic credentials for one user. */
export type BbCreds = { user: string; token: string };

export type BitbucketRepoResponse = {
  slug: string;
  archived?: boolean;
  project: { key: string };
};

export type Paged<T> = {
  values: T[];
  isLastPage: boolean;
  limit: number;
  size: number;
  start: number;
};

export type BranchStatusItem = {
  branch: BbBranch;
  pr?: BbPullRequest;
  merged: boolean;
  prState?: string;
  prDestinationBranch?: string;
  prTitle?: string;
  prUrl?: string;
  prUpdatedAt?: Date;
};
