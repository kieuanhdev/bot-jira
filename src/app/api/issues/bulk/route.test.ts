import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  bulkOperation: vi.fn(),
  probeJiraAuth: vi.fn(),
  enqueueBulkOperation: vi.fn(),
  previewBulk: vi.fn(),
  confirmBulk: vi.fn(),
  resolveFilterKeys: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    bulkOperation: { findUnique: mocks.bulkOperation },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "token", authMode: "Bearer" }),
  userBitbucketCreds: () => null,
  userJiraUsername: () => "alice",
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({}),
  probeJiraAuth: mocks.probeJiraAuth,
}));
vi.mock("@/lib/queue/boss", () => ({
  enqueueBulkOperation: mocks.enqueueBulkOperation,
}));
vi.mock("@/lib/bulk/ops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bulk/ops")>();
  return {
    ...actual,
    previewBulk: mocks.previewBulk,
    confirmBulk: mocks.confirmBulk,
    resolveFilterKeys: mocks.resolveFilterKeys,
  };
});

import { POST } from "./route";

describe("POST /api/issues/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.probeJiraAuth.mockResolvedValue(true);
  });

  it("returns 401 without authenticated session", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/issues/bulk", {
      method: "POST",
      body: JSON.stringify({ keys: ["EPM-1"], action: { kind: "assign", value: "alice" } }),
    }));
    expect(res.status).toBe(401);
  });

  it("rejects multi-field updates that mix tasks from different projects", async () => {
    const res = await POST(new Request("http://localhost/api/issues/bulk", {
      method: "POST",
      body: JSON.stringify({
        keys: ["EPM-1", "MHRM-2"],
        action: { kind: "update-fields", value: { priority: "High" } },
      }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request");
    expect(body.fields).toContain("all keys must belong to the same project");
  });

  it("previews a valid multi-field update request", async () => {
    mocks.previewBulk.mockResolvedValue({
      operationId: "op-1",
      type: "update-fields",
      total: 1,
      items: [],
      actionable: 1,
      skipped: 0,
    });

    const res = await POST(new Request("http://localhost/api/issues/bulk", {
      method: "POST",
      body: JSON.stringify({
        keys: ["EPM-1", "EPM-2"],
        action: {
          kind: "update-fields",
          value: {
            assignee: "dev_user",
            labels: ["frontend"],
            priority: "High",
            points: 5,
            dueDate: "2026-10-15",
            fixVersions: ["1.4.0"],
          },
        },
      }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.operationId).toBe("op-1");
    expect(mocks.previewBulk).toHaveBeenCalledTimes(1);
  });

  it("confirms and enqueues an operation", async () => {
    mocks.bulkOperation.mockResolvedValue({
      id: "op-1",
      requestedBy: "user-1",
      state: "preview",
      type: "update-fields",
    });
    mocks.confirmBulk.mockResolvedValue({
      operationId: "op-1",
      total: 2,
      actionable: 2,
      skipped: 0,
    });
    mocks.enqueueBulkOperation.mockResolvedValue("job-123");

    const res = await POST(new Request("http://localhost/api/issues/bulk", {
      method: "POST",
      body: JSON.stringify({
        confirm: true,
        operationId: "op-1",
      }),
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queued).toBe(true);
    expect(body.operationId).toBe("op-1");
  });

  it("resolves keys and previews with filter selector", async () => {
    mocks.resolveFilterKeys.mockResolvedValue(["EPM-10", "EPM-20"]);
    mocks.previewBulk.mockResolvedValue({
      operationId: "op-filter-1",
      type: "assign",
      total: 2,
      items: [],
      actionable: 2,
      skipped: 0,
    });

    const res = await POST(new Request("http://localhost/api/issues/bulk", {
      method: "POST",
      body: JSON.stringify({
        selector: {
          mode: "filter",
          project: "EPM",
          filters: {
            assignees: ["me"],
            statuses: ["In Progress"],
          },
        },
        action: { kind: "assign", value: "alice" },
      }),
    }));

    expect(res.status).toBe(200);
    expect(mocks.resolveFilterKeys).toHaveBeenCalledWith(
      "EPM",
      { assignees: ["me"], statuses: ["In Progress"] },
      "alice"
    );
    expect(mocks.previewBulk).toHaveBeenCalledWith(
      { kind: "assign", value: "alice" },
      ["EPM-10", "EPM-20"],
      "user-1",
      expect.anything(),
      null,
      {
        selector: {
          mode: "filter",
          project: "EPM",
          filters: {
            assignees: ["me"],
            statuses: ["In Progress"],
          },
        },
      }
    );
  });
});
