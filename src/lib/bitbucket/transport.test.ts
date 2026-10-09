import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    bitbucketBaseUrl: "http://bitbucket.test",
    bitbucketUser: "system-user",
    bitbucketToken: "system-token",
  },
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
  safeDecrypt: (v: string | null) => (v ? v.replace("enc-", "") : null),
}));

import {
  clearRepoCredCache,
  fetchPaged,
  getAllBitbucketCreds,
  getSystemBitbucketCreds,
  isBitbucketPermissionError,
  repoCredCache,
  request,
} from "./transport";

describe("Bitbucket Transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRepoCredCache();
    envMock.env.bitbucketUser = "system-user";
    envMock.env.bitbucketToken = "system-token";
    prismaMock.prisma.user.findMany.mockResolvedValue([]);
  });

  describe("isBitbucketPermissionError", () => {
    it("identifies 401 and 403 HTTP error strings", () => {
      expect(isBitbucketPermissionError(new Error("Bitbucket branches -> 401: Unauthorized"))).toBe(true);
      expect(isBitbucketPermissionError(new Error("Bitbucket pull-requests -> 403: Forbidden"))).toBe(true);
    });

    it("identifies Bitbucket specific permission error messages", () => {
      expect(isBitbucketPermissionError(new Error("AuthorisationException occurred"))).toBe(true);
      expect(isBitbucketPermissionError(new Error("User is not permitted to access this resource"))).toBe(true);
      expect(isBitbucketPermissionError(new Error("Authentication failed: invalid token"))).toBe(true);
    });

    it("returns false for non-permission errors and falsy inputs", () => {
      expect(isBitbucketPermissionError(new Error("Bitbucket branches -> 404: Not Found"))).toBe(false);
      expect(isBitbucketPermissionError(new Error("Bitbucket branches -> 500: Server Error"))).toBe(false);
      expect(isBitbucketPermissionError(new Error("Network timeout"))).toBe(false);
      expect(isBitbucketPermissionError(null)).toBe(false);
      expect(isBitbucketPermissionError(undefined)).toBe(false);
      expect(isBitbucketPermissionError("")).toBe(false);
    });
  });

  describe("Credential loading", () => {
    it("returns system credentials when configured", async () => {
      const creds = await getAllBitbucketCreds();
      expect(creds).toEqual([{ user: "system-user", token: "system-token" }]);
      expect(await getSystemBitbucketCreds()).toEqual({ user: "system-user", token: "system-token" });
    });

    it("loads and decrypts user credentials from database", async () => {
      prismaMock.prisma.user.findMany.mockResolvedValue([
        { bitbucketUserEnc: "enc-alice", bitbucketTokenEnc: "enc-alice-token" },
        { bitbucketUserEnc: "enc-bob", bitbucketTokenEnc: "enc-bob-token" },
      ]);

      const creds = await getAllBitbucketCreds();
      expect(creds).toEqual([
        { user: "system-user", token: "system-token" },
        { user: "alice", token: "alice-token" },
        { user: "bob", token: "bob-token" },
      ]);
    });

    it("deduplicates credentials matching system user", async () => {
      prismaMock.prisma.user.findMany.mockResolvedValue([
        { bitbucketUserEnc: "enc-system-user", bitbucketTokenEnc: "enc-other-token" },
      ]);

      const creds = await getAllBitbucketCreds();
      expect(creds).toHaveLength(1);
      expect(creds[0].user).toBe("system-user");
    });
  });

  describe("request and credential fallback", () => {
    it("falls back to secondary credential when the first fails with 401", async () => {
      prismaMock.prisma.user.findMany.mockResolvedValue([
        { bitbucketUserEnc: "enc-user2", bitbucketTokenEnc: "enc-token2" },
      ]);

      const fetchMock = vi.fn()
        // First call with system-user fails with 401
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        })
        // Second call with user2 succeeds
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

      vi.stubGlobal("fetch", fetchMock);

      const result = await request<{ success: boolean }>("PROJ/repo", "branches");
      expect(result).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify that repoCredCache is updated with user2
      expect(repoCredCache.get("PROJ/repo")).toEqual({ user: "user2", token: "token2" });

      vi.unstubAllGlobals();
    });

    it("uses cached credential first on subsequent requests", async () => {
      repoCredCache.set("PROJ/repo", { user: "cached-user", token: "cached-token" });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await request("PROJ/repo", "branches");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const calledAuthHeader = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      const expectedBasic = Buffer.from("cached-user:cached-token").toString("base64");
      expect(calledAuthHeader.Authorization).toBe(`Basic ${expectedBasic}`);

      vi.unstubAllGlobals();
    });

    it("does NOT fallback to second credential on non-permission errors (e.g. 500)", async () => {
      prismaMock.prisma.user.findMany.mockResolvedValue([
        { bitbucketUserEnc: "enc-user2", bitbucketTokenEnc: "enc-token2" },
      ]);

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(request("PROJ/repo", "branches")).rejects.toThrow("Bitbucket branches -> 500");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it("throws permission error when all credentials fail with 401/403", async () => {
      prismaMock.prisma.user.findMany.mockResolvedValue([
        { bitbucketUserEnc: "enc-user2", bitbucketTokenEnc: "enc-token2" },
      ]);

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: async () => "Unauthorized user 1",
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: async () => "Forbidden user 2",
        });
      vi.stubGlobal("fetch", fetchMock);

      await expect(request("PROJ/repo", "branches")).rejects.toThrow("Bitbucket branches -> 403");
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it("does not fallback when explicit creds are provided", async () => {
      prismaMock.prisma.user.findMany.mockResolvedValue([
        { bitbucketUserEnc: "enc-user2", bitbucketTokenEnc: "enc-token2" },
      ]);

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized explicit",
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        request("PROJ/repo", "branches", {}, { user: "explicit", token: "tok" })
      ).rejects.toThrow("Bitbucket branches -> 401");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it("throws when no credentials exist anywhere", async () => {
      envMock.env.bitbucketUser = "";
      envMock.env.bitbucketToken = "";
      prismaMock.prisma.user.findMany.mockResolvedValue([]);

      await expect(request("PROJ/repo", "branches")).rejects.toThrow(
        "Chưa cấu hình tài khoản Bitbucket trong hệ thống hoặc thiết lập người dùng"
      );
    });

    it("returns undefined on 204 No Content", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await request("PROJ/repo", "branches/my-branch", { method: "DELETE" });
      expect(res).toBeUndefined();

      vi.unstubAllGlobals();
    });

    it("truncates error text to 300 characters", async () => {
      const longMessage = "x".repeat(500);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => longMessage,
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(request("PROJ/repo", "branches")).rejects.toThrow(
        `Bitbucket branches -> 500: ${"x".repeat(300)}`
      );

      vi.unstubAllGlobals();
    });
  });

  describe("fetchPaged", () => {
    it("handles basePath without existing query parameters", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          values: ["a", "b"],
          isLastPage: true,
          limit: 100,
          size: 2,
          start: 0,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchPaged<string>("PROJ/repo", "branches");
      expect(res).toEqual(["a", "b"]);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://bitbucket.test/rest/api/1.0/projects/PROJ/repos/repo/branches?start=0&limit=100",
        expect.any(Object)
      );

      vi.unstubAllGlobals();
    });

    it("handles basePath with existing query parameters", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          values: [1],
          isLastPage: true,
          limit: 100,
          size: 1,
          start: 0,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchPaged<number>("PROJ/repo", "pull-requests?state=ALL");
      expect(res).toEqual([1]);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://bitbucket.test/rest/api/1.0/projects/PROJ/repos/repo/pull-requests?state=ALL&start=0&limit=100",
        expect.any(Object)
      );

      vi.unstubAllGlobals();
    });

    it("paginates across multiple pages until isLastPage is true", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            values: Array(100).fill("p1"),
            isLastPage: false,
            limit: 100,
            size: 100,
            start: 0,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            values: ["p2-1", "p2-2"],
            isLastPage: true,
            limit: 100,
            size: 2,
            start: 100,
          }),
        });
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchPaged<string>("PROJ/repo", "branches");
      expect(res).toHaveLength(102);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });

    it("stops pagination if returned page size is less than pageSize even if isLastPage is false", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          values: ["a", "b"],
          isLastPage: false,
          limit: 100,
          size: 2,
          start: 0,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchPaged<string>("PROJ/repo", "branches");
      expect(res).toEqual(["a", "b"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it("stops pagination when maxPages is reached", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          values: Array(100).fill("item"),
          isLastPage: false,
          limit: 100,
          size: 100,
          start: 0,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await fetchPaged<string>("PROJ/repo", "branches", undefined, 2);
      expect(res).toHaveLength(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.unstubAllGlobals();
    });
  });
});
