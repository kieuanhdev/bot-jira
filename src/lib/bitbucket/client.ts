import type {
  BbBranch,
  BbBranchCreateRequest,
  BbBranchCreateResult,
  BbCommit,
  BbCreds,
  BbPrActivity,
  BbPrComment,
  BbPullRequest,
  BbUser,
  BranchStatusItem,
} from "./types";
import {
  defaultTransport,
  getAllBitbucketCreds,
  getSystemBitbucketCreds,
  isBitbucketPermissionError,
} from "./transport";
import {
  createRepositoriesResource,
  discoverBitbucketRepos,
  listReposForCred,
} from "./resources/repositories";
import { createPullRequestsResource } from "./resources/pull-requests";
import { createBranchesResource } from "./resources/branches";

// Re-export domain types
export type {
  BbBranch,
  BbBranchCreateRequest,
  BbBranchCreateResult,
  BbCommit,
  BbCreds,
  BbPrActivity,
  BbPrComment,
  BbPullRequest,
  BbUser,
  BranchStatusItem,
};

// Re-export transport and credential helpers
export {
  getAllBitbucketCreds,
  getSystemBitbucketCreds,
  isBitbucketPermissionError,
};

// Re-export repository helpers
export { discoverBitbucketRepos, listReposForCred };

const reposResource = createRepositoriesResource(defaultTransport);
const prResource = createPullRequestsResource(defaultTransport);
const branchesResource = createBranchesResource(defaultTransport, {
  listPullRequests: (repo, creds) => prResource.listPullRequests(repo, creds),
});

/**
 * Unified Bitbucket Data Center API facade.
 * Composes specialized resources for repositories, branches, commits, and pull requests.
 */
export const bitbucket = {
  // Credentials & Repositories
  verifyCreds: (creds: BbCreds) => reposResource.verifyCreds(creds),
  repos: () => reposResource.repos(),
  allRepos: () => reposResource.allRepos(),

  // Branches & Commits
  listBranches: (repo: string, creds?: BbCreds) => branchesResource.listBranches(repo, creds),
  getBranch: (repo: string, branchName: string, creds?: BbCreds) =>
    branchesResource.getBranch(repo, branchName, creds),
  createBranch: (repo: string, data: BbBranchCreateRequest, creds?: BbCreds) =>
    branchesResource.createBranch(repo, data, creds),
  getCommit: (repo: string, commitId: string, creds?: BbCreds) =>
    branchesResource.getCommit(repo, commitId, creds),
  listCommits: (repo: string, branchOrRef: string, limit = 10, creds?: BbCreds) =>
    branchesResource.listCommits(repo, branchOrRef, limit, creds),
  getCommitBranches: (repo: string, commitId: string, creds?: BbCreds) =>
    branchesResource.getCommitBranches(repo, commitId, creds),
  getDefaultBranch: (repo: string, creds?: BbCreds) =>
    branchesResource.getDefaultBranch(repo, creds),
  branchStatus: (repo: string, creds?: BbCreds) => branchesResource.branchStatus(repo, creds),

  // Pull Requests
  listPullRequests: (repo: string, creds?: BbCreds, maxPages = 500) =>
    prResource.listPullRequests(repo, creds, maxPages),
  listOpenPullRequests: (repo: string, creds?: BbCreds) =>
    prResource.listOpenPullRequests(repo, creds),
  getPullRequest: (repo: string, prId: number, creds?: BbCreds) =>
    prResource.getPullRequest(repo, prId, creds),
  createPullRequest: (
    repo: string,
    data: {
      title: string;
      description?: string;
      from: string;
      to: string;
      reviewers?: string[];
    },
    creds?: BbCreds
  ) => prResource.createPullRequest(repo, data, creds),
  updatePullRequest: (
    repo: string,
    prId: number,
    data: {
      version: number;
      title: string;
      description?: string;
      reviewers?: { user: { name: string } }[];
    },
    creds?: BbCreds
  ) => prResource.updatePullRequest(repo, prId, data, creds),
  listPullRequestActivities: (repo: string, prId: number, creds?: BbCreds) =>
    prResource.listPullRequestActivities(repo, prId, creds),
};
