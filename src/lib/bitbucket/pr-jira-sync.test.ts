import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  branch: vi.fn(),
  getPr: vi.fn(),
  updatePr: vi.fn(),
  listOpen: vi.fn(),
  branchUpdate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { branchInfo: { findUnique: mocks.branch, update: mocks.branchUpdate } } }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("./client", () => ({
  bitbucket: {
    getPullRequest: mocks.getPr,
    updatePullRequest: mocks.updatePr,
    listOpenPullRequests: mocks.listOpen,
  },
  isBitbucketPermissionError: (e: unknown) => String((e as Error)?.message).includes("-> 403"),
}));

import { appendJiraKey, summarizePrSync, syncPullRequestJiraKey } from "./pr-jira-sync";

const creds = { user: "u", token: "t" };
const actor = { id: "user-1" };
const openPr = (over = {}) => ({
  id: 7,
  version: 3,
  title: "Add login",
  description: "Body",
  state: "OPEN",
  reviewers: [{ user: { name: "rev1" } }],
  fromRef: { branch: "feat/x" },
  ...over,
});

describe("syncPullRequestJiraKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.branch.mockResolvedValue({ repo: "EPM/app", branch: "feat/x", prId: 7, prState: "OPEN" });
    mocks.getPr.mockResolvedValue(openPr());
    mocks.updatePr.mockResolvedValue(undefined);
  });

  it("appends the key to the description, keeps title and reviewers, and audits", async () => {
    const res = await syncPullRequestJiraKey("b1", "EPM-3071", creds, actor);
    expect(res.status).toBe("updated");
    expect(mocks.updatePr).toHaveBeenCalledWith(
      "EPM/app",
      7,
      {
        version: 3,
        title: "Add login",
        description: "Body\n\nJira: EPM-3071",
        reviewers: [{ user: { name: "rev1" } }],
      },
      creds
    );
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "branch.pr_jira_sync" }));
  });

  it("does nothing when the key is already in the title or description", async () => {
    mocks.getPr.mockResolvedValueOnce(openPr({ title: "EPM-3071: Add login" }));
    expect((await syncPullRequestJiraKey("b1", "EPM-3071", creds, actor)).status).toBe("already_present");
    mocks.getPr.mockResolvedValueOnce(openPr({ description: "see epm-3071" }));
    expect((await syncPullRequestJiraKey("b1", "EPM-3071", creds, actor)).status).toBe("already_present");
    expect(mocks.updatePr).not.toHaveBeenCalled();
  });

  it("does not treat EPM-30710 as EPM-3071", async () => {
    mocks.getPr.mockResolvedValueOnce(openPr({ title: "EPM-30710 fix" }));
    expect((await syncPullRequestJiraKey("b1", "EPM-3071", creds, actor)).status).toBe("updated");
  });

  it("finds a PR created after the last branch scan by looking it up live", async () => {
    mocks.branch.mockResolvedValueOnce({ repo: "EPM/app", branch: "feat/x", prId: null, prState: null });
    mocks.listOpen.mockResolvedValueOnce([
      { id: 9, title: "Other", fromRef: { branch: "feat/other" } },
      { id: 7, title: "Add login", url: "http://bb/pr/7", fromRef: { branch: "feat/x" }, toRef: { branch: "dev" } },
    ]);
    const res = await syncPullRequestJiraKey("b1", "EPM-3071", creds, actor);
    expect(res.status).toBe("updated");
    expect(mocks.getPr).toHaveBeenCalledWith("EPM/app", 7, creds);
    expect(mocks.branchUpdate).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({ prId: 7, prState: "OPEN", prDestinationBranch: "dev" }),
    });
  });

  it("reports no_pr only when Bitbucket has no open PR for the branch", async () => {
    mocks.branch.mockResolvedValueOnce({ repo: "EPM/app", branch: "feat/x", prId: null, prState: null });
    mocks.listOpen.mockResolvedValueOnce([{ id: 9, fromRef: { branch: "feat/other" } }]);
    expect((await syncPullRequestJiraKey("b1", "EPM-1", creds, actor)).status).toBe("no_pr");
    expect(mocks.updatePr).not.toHaveBeenCalled();
  });

  it("trusts the live PR state over a stale cached one", async () => {
    mocks.branch.mockResolvedValueOnce({ repo: "EPM/app", branch: "feat/x", prId: 7, prState: "MERGED" });
    expect((await syncPullRequestJiraKey("b1", "EPM-1", creds, actor)).status).toBe("updated");
    mocks.branch.mockResolvedValueOnce({ repo: "EPM/app", branch: "feat/x", prId: 7, prState: "OPEN" });
    mocks.getPr.mockResolvedValueOnce(openPr({ state: "MERGED" }));
    expect((await syncPullRequestJiraKey("b1", "EPM-1", creds, actor)).status).toBe("pr_closed");
  });

  it("skips when there are no credentials", async () => {
    expect((await syncPullRequestJiraKey("b1", "EPM-1", null, actor)).status).toBe("no_credentials");
    expect(mocks.updatePr).not.toHaveBeenCalled();
  });

  it("reports forbidden instead of throwing when the user cannot edit the PR", async () => {
    mocks.updatePr.mockRejectedValueOnce(new Error("Bitbucket pull-requests/7 -> 403: nope"));
    expect((await syncPullRequestJiraKey("b1", "EPM-1", creds, actor)).status).toBe("forbidden");
  });

  it("re-reads and retries once on a version conflict", async () => {
    mocks.updatePr.mockRejectedValueOnce(new Error("Bitbucket pull-requests/7 -> 409: stale"));
    const res = await syncPullRequestJiraKey("b1", "EPM-1", creds, actor);
    expect(res.status).toBe("updated");
    expect(mocks.getPr).toHaveBeenCalledTimes(2);
    expect(mocks.updatePr).toHaveBeenCalledTimes(2);
  });
});

describe("helpers", () => {
  it("appendJiraKey handles empty descriptions", () => {
    expect(appendJiraKey(undefined, "EPM-1")).toBe("Jira: EPM-1");
    expect(appendJiraKey("a\n", "EPM-1")).toBe("a\n\nJira: EPM-1");
  });

  it("summarizePrSync lists updated and skipped PRs", () => {
    const text = summarizePrSync([
      { branchId: "1", branch: "a", status: "updated" },
      { branchId: "2", branch: "b", status: "forbidden" },
      { branchId: "3", branch: "c", status: "already_present" },
    ]);
    expect(text).toContain("đã cập nhật 1 PR");
    expect(text).toContain("b (không có quyền sửa PR)");
  });
});
