import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  systemAuth: vi.fn(),
  userAuth: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userAuth }));
vi.mock("@/lib/jira/client", () => ({ getSystemJiraAuth: mocks.systemAuth }));
vi.mock("@/lib/env", () => ({ env: { jiraBaseUrl: "https://jira.example.test" } }));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: vi.fn(),
  },
}));

import {
  handleAvatarRequest,
  isJiraOrigin,
  _clearAvatarCache,
  _getAvatarCacheSize,
} from "./avatar-route-service";
import { _resetRateLimits } from "@/lib/rate-limit";

describe("isJiraOrigin", () => {
  const base = "https://jira.example.test";

  it("returns true for exact origin match and paths", () => {
    expect(isJiraOrigin("https://jira.example.test", base)).toBe(true);
    expect(isJiraOrigin("https://jira.example.test/secure/useravatar", base)).toBe(true);
    expect(isJiraOrigin("/secure/useravatar?size=small", base)).toBe(true);
  });

  it("returns false for subdomain / suffix attacks like ${base}.evil.tld", () => {
    expect(isJiraOrigin("https://jira.example.test.evil.tld/avatar.png", base)).toBe(false);
    expect(isJiraOrigin("https://jira.example.test-evil.tld/avatar.png", base)).toBe(false);
  });

  it("returns false for userinfo trick ${base}@evil.tld/x", () => {
    expect(isJiraOrigin("https://jira.example.test@evil.tld/x", base)).toBe(false);
  });

  it("returns false for different port, scheme, or non-http protocols", () => {
    expect(isJiraOrigin("https://jira.example.test:8443/avatar.png", base)).toBe(false);
    expect(isJiraOrigin("http://jira.example.test/avatar.png", base)).toBe(false);
    expect(isJiraOrigin("javascript:alert(1)", base)).toBe(false);
    expect(isJiraOrigin("data:image/png;base64,abc", base)).toBe(false);
    expect(isJiraOrigin("//evil.tld/avatar.png", base)).toBe(false);
  });
});

describe("handleAvatarRequest security hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimits();
    if (_clearAvatarCache) _clearAvatarCache();
    mocks.session.mockResolvedValue(null);
    mocks.systemAuth.mockResolvedValue(null);
    mocks.userAuth.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated and does not call fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const req = new Request("http://localhost/api/jira/avatar?url=https://jira.example.test/avatar.png");
    const res = await handleAvatarRequest(req);

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.error).toBe("unauthorized");
  });

  it("refuses non-allowlisted origins with 400 and does not call fetch", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u-1" } });
    mocks.user.mockResolvedValue(null);
    mocks.systemAuth.mockResolvedValue({ user: "service", token: "tok", authMode: "Bearer" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const req = new Request("http://localhost/api/jira/avatar?url=https://evil.tld/avatar.png");
    const res = await handleAvatarRequest(req);

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });

  it("attaches Authorization header for Jira origin but NOT for allowlisted external origin", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u-1" } });
    mocks.user.mockResolvedValue(null);
    mocks.systemAuth.mockResolvedValue({ user: "service", token: "secret-token", authMode: "Bearer" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    // 1. Same-origin Jira avatar
    const jiraReq = new Request("http://localhost/api/jira/avatar?url=https://jira.example.test/avatar.png");
    const jiraRes = await handleAvatarRequest(jiraReq);
    expect(jiraRes.status).toBe(200);
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "https://jira.example.test/avatar.png",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      })
    );

    // 2. Allowlisted Gravatar avatar
    const gravatarReq = new Request("http://localhost/api/jira/avatar?url=https://secure.gravatar.com/avatar/test.png");
    const gravatarRes = await handleAvatarRequest(gravatarReq);
    expect(gravatarRes.status).toBe(200);
    const lastCallHeaders = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][1]?.headers as Record<string, string>;
    expect(lastCallHeaders["Authorization"]).toBeUndefined();
  });

  it("rejects non-image content-type", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u-1" } });
    mocks.systemAuth.mockResolvedValue({ user: "service", token: "tok", authMode: "Bearer" });

    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
      new Response("<html>Not an image</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );

    const req = new Request("http://localhost/api/jira/avatar?url=https://jira.example.test/not-image.html");
    const res = await handleAvatarRequest(req);
    expect(res.status).toBe(404);
  });

  it("rejects responses exceeding 512 KB", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u-1" } });
    mocks.systemAuth.mockResolvedValue({ user: "service", token: "tok", authMode: "Bearer" });

    const hugePayload = new Uint8Array(600 * 1024);
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
      new Response(hugePayload, {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    const req = new Request("http://localhost/api/jira/avatar?url=https://jira.example.test/huge.png");
    const res = await handleAvatarRequest(req);
    expect(res.status).toBe(404);
  });

  it("evicts oldest entries when cache exceeds cap", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
    );

    // Populate 501 items across distinct users to bypass user rate-limit
    for (let i = 0; i <= 500; i++) {
      mocks.session.mockResolvedValue({ user: { id: `u-${i}` } });
      mocks.systemAuth.mockResolvedValue({ user: "service", token: "tok", authMode: "Bearer" });
      const req = new Request(`http://localhost/api/jira/avatar?url=https://jira.example.test/avatar-${i}.png`);
      const res = await handleAvatarRequest(req);
      expect(res.status).toBe(200);
    }

    expect(_getAvatarCacheSize()).toBeLessThanOrEqual(500);
  });
});
