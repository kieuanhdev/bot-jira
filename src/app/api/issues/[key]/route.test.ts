import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getIssueView: vi.fn(),
  userAuth: vi.fn(),
  systemAuth: vi.fn(),
  updateIssue: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    release: { findMany: vi.fn().mockResolvedValue([]) },
    releaseTask: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userAuth }));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: mocks.systemAuth,
  jiraWith: () => ({ updateIssue: mocks.updateIssue }),
}));
vi.mock("@/lib/issues/live", () => ({ getIssueView: mocks.getIssueView }));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: mocks.refresh }));
vi.mock("@/lib/jira/people-fields", () => ({
  getProjectPeopleFields: vi.fn().mockResolvedValue({}),
}));

import { GET, PATCH } from "./route";

describe("/api/issues/[key]", () => {
  const context = { params: Promise.resolve({ key: "EPM-123" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userAuth.mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    mocks.systemAuth.mockResolvedValue({ user: "service", token: "tok", authMode: "Bearer" });
    mocks.updateIssue.mockResolvedValue(undefined);
    mocks.refresh.mockResolvedValue(true);
  });

  it("returns the existing issue detail response shape", async () => {
    mocks.getIssueView.mockResolvedValue({ jiraKey: "EPM-123", summary: "Example" });

    const response = await GET(new Request("http://localhost/api/issues/EPM-123"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      issue: { jiraKey: "EPM-123", summary: "Example" },
    });
  });

  it("returns 404 when the issue view is unavailable", async () => {
    mocks.getIssueView.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/issues/EPM-123"), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not found" });
  });

  it("keeps due-date validation before calling Jira", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/issues/EPM-123", {
        method: "PATCH",
        body: JSON.stringify({ dueDate: "09/10/2026" }),
      }),
      context
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "dueDate must be YYYY-MM-DD" });
    expect(mocks.updateIssue).not.toHaveBeenCalled();
  });

  it("updates Jira before returning the cache refresh result", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/issues/EPM-123", {
        method: "PATCH",
        body: JSON.stringify({ summary: "Updated" }),
      }),
      context
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, cacheSynced: true });
    expect(mocks.updateIssue).toHaveBeenCalledWith("EPM-123", { summary: "Updated" });
  });
});
