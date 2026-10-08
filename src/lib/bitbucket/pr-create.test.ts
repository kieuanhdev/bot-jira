import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findTask: vi.fn(),
  branchUpdate: vi.fn(),
  audit: vi.fn(),
  getDefault: vi.fn(),
  createPr: vi.fn(),
  findBranches: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { issueCache: { findUnique: mocks.findTask }, branchInfo: { update: mocks.branchUpdate, findMany: mocks.findBranches } },
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/env", () => ({ env: { bitbucketBaseBranch: "main" } }));
vi.mock("./client", () => ({
  bitbucket: { getDefaultBranch: mocks.getDefault, createPullRequest: mocks.createPr },
  isBitbucketPermissionError: (e: unknown) => String((e as Error)?.message).includes("-> 403"),
}));

import { createTaskPullRequests, planTaskPullRequests, prTitleFor } from "./pr-create";

const creds = { user: "u", token: "t" };
const actor = { id: "user-1" };
const branch = (id: string, repo: string, over = {}) => ({
  id,
  repo,
  branch: "feat/ABC-1",
  prId: null,
  prUrl: null,
  prState: null,
  merged: false,
  ...over,
});

describe("task pull request bulk create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDefault.mockImplementation(async (repo: string) => (repo === "P/legacy" ? "master" : "main"));
    mocks.findBranches.mockResolvedValue([
      { repo: "P/app", branch: "develop" },
      { repo: "P/app", branch: "feat/ABC-1" },
      { repo: "P/app", branch: "main" },
    ]);
    mocks.findTask.mockResolvedValue({
      jiraKey: "ABC-1",
      summary: "Add login",
      branchLinks: [
        { branch: branch("b1", "P/app") },
        { branch: branch("b2", "P/legacy") },
        { branch: branch("b3", "P/open", { prState: "OPEN", prId: 9, prUrl: "http://pr/9" }) },
        { branch: branch("b4", "P/done", { merged: true }) },
      ],
    });
  });

  it("plans per-repo targets and skip reasons", async () => {
    const plan = await planTaskPullRequests("ABC-1", creds);
    expect(plan?.items.map((i) => [i.repo, i.target, i.status])).toEqual([
      ["P/app", "main", "ready"],
      ["P/legacy", "master", "ready"],
      ["P/open", "main", "has_open_pr"],
      ["P/done", "main", "merged"],
    ]);
  });

  it("offers the repo's other branches as target options", async () => {
    const plan = await planTaskPullRequests("ABC-1", creds);
    expect(plan?.items[0].targetOptions).toEqual(["main", "develop"]);
  });

  it("creates PRs only for ready branches and survives a failing repo", async () => {
    mocks.createPr.mockImplementation(async (repo: string) => {
      if (repo === "P/legacy") throw new Error("Bitbucket pull-requests -> 409: There are no commits to merge");
      return { id: 11, url: "http://pr/11", title: "ABC-1: Add login", fromRef: { branch: "x" } };
    });
    const res = await createTaskPullRequests("ABC-1", creds, actor, { targets: { b1: "develop" } });
    expect(res?.results.map((r) => [r.repo, r.status])).toEqual([
      ["P/app", "created"],
      ["P/legacy", "no_changes"],
      ["P/open", "skipped_open_pr"],
      ["P/done", "skipped_merged"],
    ]);
    expect(mocks.createPr).toHaveBeenCalledTimes(2);
    expect(mocks.createPr.mock.calls[0][1]).toMatchObject({ to: "develop", title: "ABC-1: Add login" });
    expect(mocks.branchUpdate).toHaveBeenCalledTimes(1);
    expect(res?.summary).toBe("đã tạo 1 PR, bỏ qua 3");
  });

  it("reports permission errors per repo", async () => {
    mocks.createPr.mockRejectedValue(new Error("Bitbucket x -> 403: nope"));
    const res = await createTaskPullRequests("ABC-1", creds, actor, { branchIds: ["b1"] });
    expect(res?.results).toHaveLength(1);
    expect(res?.results[0].status).toBe("forbidden");
  });

  it("truncates long titles", () => {
    expect(prTitleFor("ABC-1", "x".repeat(300)).length).toBe(200);
  });
});
