import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  probeJiraAuth: vi.fn(),
  enqueueBulkOperation: vi.fn(),
  previewBulkCreate: vi.fn(),
  confirmBulkCreate: vi.fn(),
  userJiraAuth: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({}),
  probeJiraAuth: mocks.probeJiraAuth,
  JiraRequestError: class extends Error {
    constructor(msg: string, public status = 400, public retryable = false) {
      super(msg);
    }
  },
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueBulkOperation: mocks.enqueueBulkOperation,
}));
vi.mock("@/lib/bulk/create-ops", () => ({
  previewBulkCreate: mocks.previewBulkCreate,
  confirmBulkCreate: mocks.confirmBulkCreate,
}));

import { POST } from "./route";

describe("POST /api/bulk/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    mocks.probeJiraAuth.mockResolvedValue(true);
    mocks.enqueueBulkOperation.mockResolvedValue("job-123");
  });

  it("returns 401 without authenticated session", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/bulk/create", {
        method: "POST",
        body: JSON.stringify({ projectKey: "EPM", items: [] }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 428 if user has not configured Jira token", async () => {
    mocks.userJiraAuth.mockReturnValue(null);
    const res = await POST(
      new Request("http://localhost/api/bulk/create", {
        method: "POST",
        body: JSON.stringify({ projectKey: "EPM", items: [] }),
      })
    );
    expect(res.status).toBe(428);
  });

  it("handles preview request and returns preview result", async () => {
    mocks.previewBulkCreate.mockResolvedValue({
      operationId: "op-1",
      type: "create-issues",
      total: 2,
      actionable: 2,
      blocked: 0,
      metadataFingerprint: "sha256:abc",
      items: [],
    });

    const res = await POST(
      new Request("http://localhost/api/bulk/create", {
        method: "POST",
        body: JSON.stringify({
          projectKey: "EPM",
          items: [{ summary: "Task 1" }, { summary: "Task 2" }],
        }),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.operationId).toBe("op-1");
    expect(data.total).toBe(2);
    expect(mocks.previewBulkCreate).toHaveBeenCalledTimes(1);
  });

  it("handles confirm request and enqueues job", async () => {
    mocks.confirmBulkCreate.mockResolvedValue({
      operationId: "op-1",
      total: 2,
      actionable: 2,
      blocked: 0,
    });

    const res = await POST(
      new Request("http://localhost/api/bulk/create", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          operationId: "op-1",
        }),
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.queued).toBe(true);
    expect(mocks.confirmBulkCreate).toHaveBeenCalledWith("op-1", "user-1");
    expect(mocks.enqueueBulkOperation).toHaveBeenCalledWith("op-1");
  });

  it("returns 400 when confirming with expired Jira credentials", async () => {
    mocks.probeJiraAuth.mockResolvedValue(false);

    const res = await POST(
      new Request("http://localhost/api/bulk/create", {
        method: "POST",
        body: JSON.stringify({
          confirm: true,
          operationId: "op-1",
        }),
      })
    );

    expect(res.status).toBe(400);
    expect(mocks.confirmBulkCreate).not.toHaveBeenCalled();
  });
});
