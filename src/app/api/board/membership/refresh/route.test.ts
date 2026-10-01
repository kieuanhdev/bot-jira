import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  enqueueBoardMembershipRefresh: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueBoardMembershipRefresh: mocks.enqueueBoardMembershipRefresh,
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: vi.fn().mockReturnValue({ user: "usr", token: "tok", authMode: "Bearer" }),
}));

import { POST } from "./route";

describe("POST /api/board/membership/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      jiraUserEnc: "enc",
      jiraTokenEnc: "tok",
    });
    mocks.enqueueBoardMembershipRefresh.mockResolvedValue("job-refresh-1");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/board/membership/refresh", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/board/membership/refresh", {
        method: "POST",
        body: JSON.stringify({ projectKey: "invalid_key!!!", boardId: 101 }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("enqueues refresh job with high priority and returns 202", async () => {
    const res = await POST(
      new Request("http://localhost/api/board/membership/refresh", {
        method: "POST",
        body: JSON.stringify({ projectKey: "EPM", boardId: 101, reason: "manual_retry" }),
      })
    );
    expect(res.status).toBe(202);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.jobId).toBe("job-refresh-1");
    expect(data.state).toBe("preparing");
    expect(mocks.enqueueBoardMembershipRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        projectKey: "EPM",
        boardId: 101,
        priority: "high",
        reason: "manual_retry",
      })
    );
  });
});
