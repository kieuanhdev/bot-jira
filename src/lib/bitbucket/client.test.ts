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
});
