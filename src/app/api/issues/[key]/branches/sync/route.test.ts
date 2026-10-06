import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  syncJiraDevStatusForIssue: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: vi.fn((user: { jiraTokenEnc?: string | null } | null | undefined) =>
    user?.jiraTokenEnc ? { user: "alice", token: "tok", authMode: "Bearer" } : null
  ),
}));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/jira/dev-status", () => ({
  syncJiraDevStatusForIssue: mocks.syncJiraDevStatusForIssue,
}));

import { POST } from "./route";

describe("POST /api/issues/[key]/branches/sync", () => {
  const ctx = { params: Promise.resolve({ key: "EPM-4365" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await POST(new Request("http://localhost"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 428 when no credentials found", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.user.mockResolvedValueOnce({ jiraTokenEnc: null });

    const res = await POST(new Request("http://localhost"), ctx);
    expect(res.status).toBe(428);
  });

  it("syncs branches and returns count", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.user.mockResolvedValueOnce({ jiraTokenEnc: "encrypted-token" });
    mocks.syncJiraDevStatusForIssue.mockResolvedValueOnce({
      ok: true,
      syncedBranches: [
        { repo: "EPM/feat_bill", branch: "hotfix/EPM-4365", merged: false },
      ],
    });

    const res = await POST(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.count).toBe(1);
    expect(mocks.syncJiraDevStatusForIssue).toHaveBeenCalledWith(
      "EPM-4365",
      expect.objectContaining({ user: "alice" })
    );
  });

  it("returns 400 when sync fails", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.user.mockResolvedValueOnce({ jiraTokenEnc: "encrypted-token" });
    mocks.syncJiraDevStatusForIssue.mockResolvedValueOnce({
      ok: false,
      error: "Task not found on Jira",
      syncedBranches: [],
    });

    const res = await POST(new Request("http://localhost"), ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Task not found on Jira");
  });
});
