import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUser: vi.fn(),
  updateUser: vi.fn(),
  verifyJira: vi.fn(),
  verifyBitbucket: vi.fn(),
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
vi.mock("@/lib/crypto", () => ({ encrypt: (value: string) => `enc:${value}` }));
vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.test",
    bitbucketBaseUrl: "https://bitbucket.example.test",
  },
}));
vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: { verifyCreds: mocks.verifyBitbucket },
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ me: vi.fn() }),
}));
vi.mock("@/lib/jira/auth-service", () => ({
  verifyJiraCredential: mocks.verifyJira,
  cleanString: (value: string | null | undefined) => value?.trim() || null,
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => null,
  userBitbucketCreds: () => null,
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueCheckBranches: vi.fn(),
  enqueueJiraDispatch: vi.fn(),
}));

import { PUT } from "./route";

describe("PUT /api/me/credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.updateUser.mockResolvedValue({
      id: "user-1",
      jiraUserEnc: null,
      jiraTokenEnc: null,
      jiraAuth: null,
      jiraUsername: null,
      bitbucketUserEnc: null,
      bitbucketTokenEnc: null,
    });
  });

  it("returns 401 for an expired session whose user row no longer exists", async () => {
    mocks.findUser.mockResolvedValue(null);
    const response = await PUT(
      new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "session_invalid" });
  });

  it("does not persist a Jira credential that fails verification", async () => {
    mocks.verifyJira.mockResolvedValue({ ok: false, message: "Token Jira không hợp lệ" });
    const response = await PUT(
      new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({ jiraUser: "alice", jiraToken: "bad-token" }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Token Jira không hợp lệ",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("preserves the disconnect response contract without echoing credentials", async () => {
    const response = await PUT(
      new Request("http://localhost/api/me/credentials", {
        method: "PUT",
        body: JSON.stringify({ disconnectJira: true, disconnectBitbucket: true }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      verify: {
        jira: { ok: false },
        bitbucket: { ok: false },
      },
      discovery: {},
      jiraLinked: false,
      bitbucketLinked: false,
    });
    expect(mocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          jiraTokenEnc: null,
          bitbucketTokenEnc: null,
        }),
      })
    );
  });
});
