import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    bitbucketBaseUrl: "http://bitbucket.test",
    bitbucketUser: "sys-user",
    bitbucketToken: "sys-token",
    bitbucketAutoDiscover: true,
  },
  bitbucketRepoList: ["PROJ/configured-repo"],
}));

vi.mock("@/lib/env", () => envMock);

const prismaMock = vi.hoisted(() => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);

vi.mock("@/lib/crypto", () => ({
  safeDecrypt: (v: string | null) => v,
}));

import {
  clearDiscoveryCache,
  createRepositoriesResource,
  discoverBitbucketRepos,
  listReposForCred,
} from "./repositories";
import { clearRepoCredCache } from "../transport";

describe("Bitbucket Repositories Resource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDiscoveryCache();
    clearRepoCredCache();
    envMock.env.bitbucketAutoDiscover = true;
    prismaMock.prisma.user.findMany.mockResolvedValue([]);
  });

  describe("verifyCreds", () => {
    it("calls projects endpoint with limit=1 and succeeds on 200", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", fetchMock);

      const resource = createRepositoriesResource();
      await expect(
        resource.verifyCreds({ user: "alice", token: "tok" })
      ).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledWith(
        "http://bitbucket.test/rest/api/1.0/projects?limit=1",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${Buffer.from("alice:tok").toString("base64")}`,
          }),
        })
      );

      vi.unstubAllGlobals();
    });

    it("throws formatted error when verify fails", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Bad credentials",
      });
      vi.stubGlobal("fetch", fetchMock);

      const resource = createRepositoriesResource();
      await expect(
        resource.verifyCreds({ user: "alice", token: "tok" })
      ).rejects.toThrow("Bitbucket projects -> 401: Bad credentials");

      vi.unstubAllGlobals();
    });
  });

  describe("listReposForCred", () => {
    it("paginates and filters out personal and archived repos", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            values: [
              { slug: "repo1", project: { key: "PROJ" } },
              { slug: "personal", project: { key: "~user" } },
              { slug: "archived", project: { key: "PROJ" }, archived: true },
            ],
            isLastPage: false,
            nextPageStart: 100,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            values: [{ slug: "repo2", project: { key: "PROJ" } }],
            isLastPage: true,
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const repos = await listReposForCred({ user: "alice", token: "tok" });
      expect(repos).toEqual(["PROJ/repo1", "PROJ/repo2"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it("handles fetch failure gracefully by stopping and returning collected repos", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error("Network down"));
      vi.stubGlobal("fetch", fetchMock);

      const repos = await listReposForCred({ user: "alice", token: "tok" });
      expect(repos).toEqual([]);

      vi.unstubAllGlobals();
    });
  });

  describe("repos and allRepos", () => {
    it("repos returns the static configured repo list", () => {
      const resource = createRepositoriesResource();
      expect(resource.repos()).toEqual(["PROJ/configured-repo"]);
    });

    it("allRepos returns configured list when auto-discover is disabled", async () => {
      envMock.env.bitbucketAutoDiscover = false;
      const resource = createRepositoriesResource();
      const all = await resource.allRepos();
      expect(all).toEqual(["PROJ/configured-repo"]);
    });

    it("allRepos merges configured and discovered repos without duplicates", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          values: [
            { slug: "configured-repo", project: { key: "proj" } }, // case-insensitive duplicate
            { slug: "discovered-repo", project: { key: "PROJ" } },
          ],
          isLastPage: true,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const resource = createRepositoriesResource();
      const all = await resource.allRepos();

      expect(all).toEqual(["PROJ/configured-repo", "PROJ/discovered-repo"]);

      vi.unstubAllGlobals();
    });

    it("discoverBitbucketRepos uses cache until expired or forced", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          values: [{ slug: "repo-1", project: { key: "PROJ" } }],
          isLastPage: true,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const repos1 = await discoverBitbucketRepos();
      expect(repos1).toEqual(["PROJ/repo-1"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const repos2 = await discoverBitbucketRepos();
      expect(repos2).toEqual(["PROJ/repo-1"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Forced call should re-fetch
      const repos3 = await discoverBitbucketRepos(true);
      expect(repos3).toEqual(["PROJ/repo-1"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });
  });
});
