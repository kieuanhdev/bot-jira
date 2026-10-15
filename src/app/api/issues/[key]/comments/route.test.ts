import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userAuth: vi.fn(),
  addComment: vi.fn(),
  notifyWatchers: vi.fn(),
  upsertComments: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.user } },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userAuth }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: vi.fn(() => ({
    addComment: mocks.addComment,
  })),
}));
vi.mock("@/lib/issues/notify-watchers", () => ({
  notifyWatchersOfComment: mocks.notifyWatchers,
}));
vi.mock("@/lib/issues/cache", () => ({
  upsertJiraComments: mocks.upsertComments,
}));

import { POST } from "./route";

describe("POST /api/issues/[key]/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", name: "User 1" } });
    mocks.user.mockResolvedValue({ id: "user-1", jiraUsername: "user1" });
    mocks.userAuth.mockReturnValue({ user: "user1", token: "tok" });
    mocks.addComment.mockResolvedValue({ id: "comm-123", author: { displayName: "User 1" } });
    mocks.notifyWatchers.mockResolvedValue(undefined);
    mocks.upsertComments.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("http://localhost/api/issues/TEST-1/comments", {
      method: "POST",
      body: JSON.stringify({ body: "Hello" }),
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 invalid_json on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/issues/TEST-1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("returns 400 when body text is missing or whitespace only", async () => {
    const req = new Request("http://localhost/api/issues/TEST-1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "   " }),
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "body required" });
  });

  it("successfully adds comment", async () => {
    const req = new Request("http://localhost/api/issues/TEST-1/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Test comment text" }),
    });

    const res = await POST(req, { params: Promise.resolve({ key: "TEST-1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      comment: { author: "User 1", body: "Test comment text" },
    });
    expect(mocks.addComment).toHaveBeenCalledWith("TEST-1", "Test comment text");
  });
});
