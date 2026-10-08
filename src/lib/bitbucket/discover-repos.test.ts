import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    bitbucketBaseUrl: "http://bb.test",
    bitbucketUser: "sys",
    bitbucketToken: "sys-token",
    bitbucketAutoDiscover: true,
  },
  bitbucketRepoList: ["EPM/easy_pos"],
}));

vi.mock("@/lib/env", () => envMock);
vi.mock("@/lib/crypto", () => ({ safeDecrypt: (v: string | null) => v }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([{ bitbucketUserEnc: "alice", bitbucketTokenEnc: "alice-token" }]),
    },
  },
}));

import { bitbucket, discoverBitbucketRepos } from "./client";

const page = (repos: [string, string, boolean?][]) => ({
  ok: true,
  json: async () => ({
    isLastPage: true,
    values: repos.map(([project, slug, archived]) => ({ slug, archived, project: { key: project } })),
  }),
});

function mockFetch(byUser: Record<string, ReturnType<typeof page> | { ok: false; status: number }>) {
  global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string>).Authorization.replace("Basic ", "");
    const user = Buffer.from(auth, "base64").toString().split(":")[0];
    return (byUser[user] ?? { ok: false, status: 401 }) as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("discoverBitbucketRepos", () => {
  beforeEach(() => {
    envMock.env.bitbucketAutoDiscover = true;
  });

  it("merges repos from every account, even when one account is rejected", async () => {
    mockFetch({
      sys: { ok: false, status: 401 },
      alice: page([
        ["ECM", "easy_ca_mobile"],
        ["EPM", "easy_pos"],
        ["~alice", "playground"],
        ["ECM", "old_repo", true],
      ]),
    });
    const repos = await discoverBitbucketRepos(true);
    expect(repos.sort()).toEqual(["ECM/easy_ca_mobile", "EPM/easy_pos"]);
  });

  it("allRepos adds discovered repos to the configured list without duplicates", async () => {
    mockFetch({ alice: page([["ECM", "easy_ca_mobile"], ["EPM", "easy_pos"]]) });
    await discoverBitbucketRepos(true);
    expect(await bitbucket.allRepos()).toEqual(["EPM/easy_pos", "ECM/easy_ca_mobile"]);
  });

  it("falls back to the configured list when auto discovery is disabled", async () => {
    envMock.env.bitbucketAutoDiscover = false;
    mockFetch({ alice: page([["ECM", "easy_ca_mobile"]]) });
    expect(await bitbucket.allRepos()).toEqual(["EPM/easy_pos"]);
  });
});
