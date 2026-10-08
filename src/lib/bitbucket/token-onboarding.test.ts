import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  reposByUser: {} as Record<string, string[]>,
  creds: [] as { user: string; token: string }[],
  discover: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ bitbucketRepoList: ["EPM/easy_pos"] }));
vi.mock("./client", () => ({
  listReposForCred: vi.fn(async (c: { user: string }) => m.reposByUser[c.user] ?? []),
  getAllBitbucketCreds: vi.fn(async () => m.creds),
  discoverBitbucketRepos: m.discover,
}));

import { onboardBitbucketToken } from "./token-onboarding";

describe("onboardBitbucketToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.creds = [
      { user: "sys", token: "t0" },
      { user: "anhnk", token: "t1" },
      { user: "vunt", token: "t2" },
    ];
    m.reposByUser = {
      sys: [],
      anhnk: ["EPM/easy_pos", "SMA/sds_picker"],
      vunt: ["EPM/easy_pos", "ECM/easy_ca_mobile", "CICM/cic_app"],
    };
  });

  it("reports only the repos no other stored account could read", async () => {
    const res = await onboardBitbucketToken({ user: "vunt", token: "t2" });
    expect(res.readable).toBe(3);
    expect(res.newRepos.sort()).toEqual(["CICM/cic_app", "ECM/easy_ca_mobile"]);
  });

  it("treats repos already configured in BITBUCKET_REPOS as known", async () => {
    const res = await onboardBitbucketToken({ user: "vunt", token: "t2" });
    expect(res.newRepos).not.toContain("EPM/easy_pos");
  });

  it("returns nothing new when the token adds no access, and refreshes the shared list", async () => {
    m.reposByUser.anhnk = ["EPM/easy_pos", "ECM/easy_ca_mobile"]; // all already readable by vunt
    const res = await onboardBitbucketToken({ user: "anhnk", token: "t1" });
    expect(res.newRepos).toEqual([]);
    expect(m.discover).toHaveBeenCalledWith(true);
  });
});
