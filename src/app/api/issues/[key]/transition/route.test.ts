import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userAuth: vi.fn(),
  clientTransition: vi.fn(),
  refreshCache: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.user } },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userAuth }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: vi.fn(() => ({
    transition: mocks.clientTransition,
  })),
}));
vi.mock("@/lib/issues/cache", () => ({
  refreshJiraIssueCache: mocks.refreshCache,
}));

import { POST } from "./route";

describe("POST /api/issues/[key]/transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ id: "user-1" });
    mocks.userAuth.mockReturnValue({ user: "u", token: "tok" });
    mocks.clientTransition.mockResolvedValue(undefined);
    mocks.refreshCache.mockResolvedValue(true);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("http://localhost/api/issues/TEST-1/transition", {
      method: "POST",
      body: JSON.stringify({ transitionId: "31" }),
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 invalid_json on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/issues/TEST-1/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not-json",
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("returns 400 when transitionId is missing or empty", async () => {
    const req = new Request("http://localhost/api/issues/TEST-1/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transitionId: "   " }),
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "transitionId required" });
  });

  it("successfully performs transition", async () => {
    const req = new Request("http://localhost/api/issues/TEST-1/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transitionId: "31" }),
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, cacheSynced: true });
    expect(mocks.clientTransition).toHaveBeenCalledWith("TEST-1", "31");
  });
});
