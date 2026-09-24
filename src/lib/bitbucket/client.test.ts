import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    bitbucketBaseUrl: "http://bitbucket.test",
    bitbucketUser: "user",
    bitbucketToken: "token",
    bitbucketBaseBranch: "main",
    bitbucketRepos: "team/app1",
  },
  bitbucketRepoList: ["team/app1"],
}));

const MERGED_STATES = new Set(["MERGED"]);

function isMerged(prState: string | undefined, prDestinationBranch: string | undefined, base: string): boolean {
  return (
    prState != null &&
    MERGED_STATES.has(prState) &&
    (prDestinationBranch === base || prDestinationBranch == null)
  );
}

describe("M2-03 Bitbucket PR state handling", () => {
  it("MERGED into base branch counts as merged", () => {
    expect(isMerged("MERGED", "main", "main")).toBe(true);
  });

  it("MERGED with no destination (API omission) counts as merged", () => {
    expect(isMerged("MERGED", undefined, "main")).toBe(true);
  });

  it("MERGED into a different branch does NOT count as merged into base", () => {
    expect(isMerged("MERGED", "feature/x", "main")).toBe(false);
  });

  it("CLOSED is never merged", () => {
    expect(isMerged("CLOSED", "main", "main")).toBe(false);
    expect(isMerged("CLOSED", undefined, "main")).toBe(false);
  });

  it("DECLINED is never merged", () => {
    expect(isMerged("DECLINED", "main", "main")).toBe(false);
  });

  it("OPEN is never merged", () => {
    expect(isMerged("OPEN", "main", "main")).toBe(false);
  });

  it("no PR means not merged", () => {
    expect(isMerged(undefined, undefined, "main")).toBe(false);
  });

  it("empty state string is never merged", () => {
    expect(isMerged("", "main", "main")).toBe(false);
  });
});

describe("M2-03 Bitbucket pagination", () => {
  it("fetchPaged follows isLastPage", async () => {
    const pages = [
      { values: [1, 2, 3], isLastPage: false, limit: 3, size: 3, start: 0 },
      { values: [4, 5], isLastPage: true, limit: 3, size: 2, start: 3 },
    ];
    let call = 0;
    const fetchPage = async () => pages[call++];

    const out: number[] = [];
    for (let page = 0; page < 10; page++) {
      const res = await fetchPage();
      out.push(...(res.values as number[]));
      if (res.isLastPage || res.values.length < res.limit) break;
    }
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(call).toBe(2);
  });

  it("single page with isLastPage stops immediately", async () => {
    const res = { values: [1], isLastPage: true, limit: 100, size: 1, start: 0 };
    const out: number[] = [];
    out.push(...(res.values as number[]));
    expect(out).toEqual([1]);
  });

  it("uses a query separator and normalizes Bitbucket Data Center branch fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        values: [
          {
            id: "refs/heads/feature/test",
            displayId: "feature/test",
            latestCommit: "abc123",
          },
        ],
        isLastPage: true,
        limit: 100,
        size: 1,
        start: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { bitbucket } = await import("./client");

    await expect(bitbucket.listBranches("team/app1")).resolves.toEqual([
      expect.objectContaining({ name: "feature/test", latestCommit: "abc123" }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://bitbucket.test/rest/api/1.0/projects/team/repos/app1/branches?start=0&limit=100",
      expect.any(Object)
    );
    vi.unstubAllGlobals();
  });

  it("normalizes Bitbucket Data Center pull-request refs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          values: [
            {
              id: 7,
              state: "OPEN",
              fromRef: { displayId: "feature/test" },
              toRef: { displayId: "main" },
            },
          ],
          isLastPage: true,
          limit: 100,
          size: 1,
          start: 0,
        }),
      })
    );
    const { bitbucket } = await import("./client");

    await expect(bitbucket.listPullRequests("team/app1")).resolves.toEqual([
      expect.objectContaining({
        id: 7,
        fromRef: { branch: "feature/test" },
        toRef: { branch: "main" },
      }),
    ]);
    vi.unstubAllGlobals();
  });

  it("extracts PR url and picks the latest PR for a branch", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("/branches")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            values: [{ displayId: "feature/auth" }],
            isLastPage: true,
            limit: 100,
            size: 1,
            start: 0,
          }),
        });
      }
      if (url.includes("/pull-requests")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            values: [
              {
                id: 10,
                title: "Old PR",
                state: "DECLINED",
                fromRef: { displayId: "feature/auth" },
                toRef: { displayId: "main" },
                updatedDate: 1000,
                links: { self: [{ href: "http://bitbucket.test/pr/10" }] },
              },
              {
                id: 12,
                title: "New PR",
                state: "OPEN",
                fromRef: { displayId: "feature/auth" },
                toRef: { displayId: "main" },
                updatedDate: 2000,
                links: { self: [{ href: "http://bitbucket.test/pr/12" }] },
              },
            ],
            isLastPage: true,
            limit: 100,
            size: 2,
            start: 0,
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);
    const { bitbucket } = await import("./client");
    const status = await bitbucket.branchStatus("team/app1");

    expect(status).toHaveLength(1);
    expect(status[0].pr?.id).toBe(12);
    expect(status[0].prTitle).toBe("New PR");
    expect(status[0].prUrl).toBe("http://bitbucket.test/pr/12");
    expect(status[0].prState).toBe("OPEN");
    expect(status[0].prUpdatedAt).toEqual(new Date(2000));
    vi.unstubAllGlobals();
  });
});
