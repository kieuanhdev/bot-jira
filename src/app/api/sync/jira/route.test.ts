import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  enqueueJiraProjectSync: vi.fn(),
  enqueueJiraDispatch: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/env", () => ({
  isKnownProject: (key: string) => ["EPM", "MR", "CICM"].includes(key),
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueJiraProjectSync: mocks.enqueueJiraProjectSync,
  enqueueJiraDispatch: mocks.enqueueJiraDispatch,
}));

import { POST } from "./route";

describe("POST /api/sync/jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "user-1", role: "member" },
    });
    mocks.enqueueJiraProjectSync.mockResolvedValue("job-epm-1");
    mocks.enqueueJiraDispatch.mockResolvedValue("job-disp-1");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ projectKey: "EPM" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when project key format is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ projectKey: "invalid_key_$$$" }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("unknown_project");
  });

  it("returns 400 when regular user sends no projectKey", async () => {
    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("project_required");
  });

  it("returns 202 queued for valid project sync request", async () => {
    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ projectKey: "epm" }),
      })
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.state).toBe("queued");
    expect(body.jobId).toBe("job-epm-1");
    expect(body.projectKey).toBe("EPM");
    expect(body.full).toBe(false);
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "EPM",
        source: "manual",
        full: false,
        requestedBy: "user-1",
      })
    );
  });

  it("returns 202 already_running when job is coalesced (jobId is null)", async () => {
    mocks.enqueueJiraProjectSync.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ projectKey: "EPM" }),
      })
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.state).toBe("already_running");
    expect(body.jobId).toBeNull();
    expect(body.projectKey).toBe("EPM");
  });

  it("allows admin to dispatch all projects", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    });

    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ full: true }),
      })
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.state).toBe("queued");
    expect(body.projectKey).toBeNull();
    expect(body.full).toBe(true);
    expect(mocks.enqueueJiraDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "admin",
        full: true,
        requestedBy: "admin-1",
      })
    );
  });

  it("returns 503 when queue is unavailable", async () => {
    mocks.enqueueJiraProjectSync.mockRejectedValue(new Error("Database disconnected"));
    const res = await POST(
      new Request("http://localhost/api/sync/jira", {
        method: "POST",
        body: JSON.stringify({ projectKey: "EPM" }),
      })
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("queue_unavailable");
  });
});
