import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
  verifyJira: vi.fn(),
  verifyBitbucket: vi.fn(),
  jiraMe: vi.fn(),
  onboardBitbucket: vi.fn(),
  onboardJira: vi.fn(),
  enqueueCheckBranches: vi.fn(),
  enqueueJiraDispatch: vi.fn(),
  userJiraAuth: vi.fn(),
  userBitbucketCreds: vi.fn(),
  clearBitbucketCredsCache: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUser,
      update: mocks.updateUser,
    },
  },
}));
vi.mock("@/lib/crypto", () => ({
  encrypt: (val: string) => `encrypted:${val}`,
  decrypt: (val: string) => val.replace(/^encrypted:/, ""),
  safeDecrypt: (val: string | null | undefined) => (val ? val.replace(/^encrypted:/, "") : null),
}));
vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    bitbucketBaseUrl: "https://bitbucket.example.com",
  },
}));
vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: { verifyCreds: mocks.verifyBitbucket },
  clearBitbucketCredsCache: mocks.clearBitbucketCredsCache,
}));
vi.mock("@/lib/bitbucket/transport", () => ({
  clearBitbucketCredsCache: mocks.clearBitbucketCredsCache,
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ me: mocks.jiraMe }),
}));
vi.mock("@/lib/jira/auth-service", () => ({
  verifyJiraCredential: mocks.verifyJira,
  cleanString: (v: string | null | undefined) => v?.trim() || null,
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
  userBitbucketCreds: mocks.userBitbucketCreds,
}));
vi.mock("@/lib/bitbucket/token-onboarding", () => ({
  onboardBitbucketToken: mocks.onboardBitbucket,
}));
vi.mock("@/lib/jira/token-onboarding", () => ({
  onboardJiraToken: mocks.onboardJira,
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueCheckBranches: mocks.enqueueCheckBranches,
  enqueueJiraDispatch: mocks.enqueueJiraDispatch,
}));

import { handleCredentialsUpdateRequest, verifyCreds } from "./route-service";
import { env } from "@/lib/env";

describe("credentials route-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-123" } });
    mocks.findUser.mockResolvedValue({ id: "user-123" });
    mocks.updateUser.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "user-123",
      jiraUserEnc: data.jiraUserEnc ?? null,
      jiraTokenEnc: data.jiraTokenEnc ?? null,
      jiraAuth: data.jiraAuth ?? null,
      jiraUsername: data.jiraUsername ?? null,
      bitbucketUserEnc: data.bitbucketUserEnc ?? null,
      bitbucketTokenEnc: data.bitbucketTokenEnc ?? null,
    }));
    mocks.userJiraAuth.mockReturnValue(null);
    mocks.userBitbucketCreds.mockReturnValue(null);
    mocks.onboardBitbucket.mockResolvedValue({ readable: 1, newRepos: ["repo-1"] });
    mocks.onboardJira.mockResolvedValue({ readable: 1, registered: ["PROJ-1"] });
    (env as { bitbucketBaseUrl: string }).bitbucketBaseUrl = "https://bitbucket.example.com";
    (env as { jiraBaseUrl: string }).jiraBaseUrl = "https://jira.example.com";
  });

  describe("handleCredentialsUpdateRequest", () => {
    it("returns 401 when unauthenticated", async () => {
      mocks.session.mockResolvedValue(null);
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({}),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toEqual({ error: "unauthorized" });
    });

    it("returns 401 session_invalid when session user is deleted from DB", async () => {
      mocks.findUser.mockResolvedValue(null);
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({}),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json).toEqual({ error: "session_invalid" });
    });

    it("returns 422 when Jira verification fails", async () => {
      mocks.verifyJira.mockResolvedValue({ ok: false, message: "Invalid Jira PAT" });
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({ jiraToken: "invalid-pat", jiraUser: "alice" }),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json).toEqual({ ok: false, error: "Invalid Jira PAT" });
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it("returns 400 when Bitbucket token is provided without Bitbucket username", async () => {
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({ bitbucketToken: "bb-pat" }),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({
        ok: false,
        error: "Username Bitbucket là bắt buộc khi lưu token.",
      });
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it("returns 503 when Bitbucket URL is not configured on server", async () => {
      (env as { bitbucketBaseUrl: string }).bitbucketBaseUrl = "";
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({ bitbucketToken: "bb-pat", bitbucketUser: "alice" }),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toEqual({
        ok: false,
        error: "Máy chủ chưa cấu hình Bitbucket URL để xác minh token.",
      });
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it("returns 422 with cleaned error message when Bitbucket verifyCreds throws", async () => {
      mocks.verifyBitbucket.mockRejectedValue(new Error("Bitbucket returned 401 unauthorized"));
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({ bitbucketToken: "bad-pat", bitbucketUser: "alice" }),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain("Không thể xác minh token Bitbucket");
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });

    it("encrypts tokens at rest and never leaks secrets in response", async () => {
      mocks.verifyJira.mockResolvedValue({
        ok: true,
        mode: "Bearer",
        name: "alice_jira",
        identityKey: "jira:alice_jira",
      });
      mocks.verifyBitbucket.mockResolvedValue(undefined);
      mocks.userJiraAuth.mockReturnValue({ user: "alice_jira", token: "secret-jira-token", authMode: "Bearer" });
      mocks.userBitbucketCreds.mockReturnValue({ user: "alice_bb", token: "secret-bb-token" });
      mocks.jiraMe.mockResolvedValue({ displayName: "Alice Wonder" });

      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({
          jiraToken: "secret-jira-token",
          jiraUser: "alice_jira",
          bitbucketToken: "secret-bb-token",
          bitbucketUser: "alice_bb",
        }),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.jiraLinked).toBe(true);
      expect(json.bitbucketLinked).toBe(true);
      expect(json.verify.jira.ok).toBe(true);
      expect(json.verify.bitbucket.ok).toBe(true);

      // Verify no secrets or encrypted tokens are in the response JSON
      const resStr = JSON.stringify(json);
      expect(resStr).not.toContain("secret-jira-token");
      expect(resStr).not.toContain("secret-bb-token");
      expect(resStr).not.toContain("encrypted:");

      // Verify database write received encrypted fields
      expect(mocks.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-123" },
          data: expect.objectContaining({
            jiraTokenEnc: "encrypted:secret-jira-token",
            jiraUserEnc: "encrypted:alice_jira",
            jiraAuth: "Bearer",
            jiraUsername: "alice_jira",
            bitbucketTokenEnc: "encrypted:secret-bb-token",
            bitbucketUserEnc: "encrypted:alice_bb",
          }),
        })
      );

      // Onboarding enqueued
      expect(mocks.enqueueCheckBranches).toHaveBeenCalled();
      expect(mocks.enqueueJiraDispatch).toHaveBeenCalledWith({ source: "admin" });
      expect(mocks.clearBitbucketCredsCache).toHaveBeenCalled();
    });

    it("handles disconnect flags to safely clear stored tokens", async () => {
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({
          disconnectJira: true,
          disconnectBitbucket: true,
        }),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.jiraLinked).toBe(false);
      expect(json.bitbucketLinked).toBe(false);

      expect(mocks.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jiraUserEnc: null,
            jiraTokenEnc: null,
            jiraAuth: null,
            jiraVerifiedAt: null,
            jiraUsername: null,
            bitbucketUserEnc: null,
            bitbucketTokenEnc: null,
            bitbucketVerifiedAt: null,
          }),
        })
      );
      expect(mocks.clearBitbucketCredsCache).toHaveBeenCalled();
    });

    it("preserves existing credentials when tokens are omitted", async () => {
      const req = new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({}),
      });

      const res = await handleCredentialsUpdateRequest(req);
      expect(res.status).toBe(200);

      // Verify undefined is passed for credentials so Prisma does not overwrite them
      const updateCall = mocks.updateUser.mock.calls[0][0];
      expect(updateCall.data.jiraTokenEnc).toBeUndefined();
      expect(updateCall.data.bitbucketTokenEnc).toBeUndefined();
      expect(mocks.clearBitbucketCredsCache).not.toHaveBeenCalled();
    });
  });

  describe("verifyCreds", () => {
    it("returns false for both when user has no credentials", async () => {
      const result = await verifyCreds({});
      expect(result).toEqual({
        jira: { ok: false },
        bitbucket: { ok: false },
      });
    });

    it("returns clean error on upstream failure", async () => {
      mocks.userJiraAuth.mockReturnValue({ user: "a", token: "t", authMode: "Bearer" });
      mocks.jiraMe.mockRejectedValue(new Error("Jira GET /rest/api/2/myself -> 401: Unauthorized"));

      mocks.userBitbucketCreds.mockReturnValue({ user: "b", token: "t" });
      mocks.verifyBitbucket.mockRejectedValue(new Error("<html><title>Error</title></html>"));

      const result = await verifyCreds({
        jiraTokenEnc: "encrypted:t",
        bitbucketTokenEnc: "encrypted:t",
      });

      expect(result.jira.ok).toBe(false);
      expect(result.jira.detail).toBe("Dịch vụ trả về 401 — hãy kiểm tra token và quyền truy cập");

      expect(result.bitbucket.ok).toBe(false);
      expect(result.bitbucket.detail).toBe("Authentication failed (401) — check the token / auth type");
    });
  });
});
