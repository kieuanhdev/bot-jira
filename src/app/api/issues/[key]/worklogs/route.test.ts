import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  worklogIdempotencyFindUnique: vi.fn(),
  worklogIdempotencyUpsert: vi.fn(),
  worklogIdempotencyUpdate: vi.fn(),
  addWorklog: vi.fn(),
  refreshJiraIssueCache: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    worklogIdempotency: {
      findUnique: mocks.worklogIdempotencyFindUnique,
      upsert: mocks.worklogIdempotencyUpsert,
      update: mocks.worklogIdempotencyUpdate,
    },
  },
}));
vi.mock("@/lib/jira/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/client")>();
  return {
    ...actual,
    jiraWith: vi.fn(() => ({
      addWorklog: mocks.addWorklog,
    })),
  };
});
vi.mock("@/lib/issues/cache", () => ({
  refreshJiraIssueCache: mocks.refreshJiraIssueCache,
}));
vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: vi.fn((user: { jiraTokenEnc?: string | null } | null | undefined) =>
    user?.jiraTokenEnc ? { user: "alice", token: "tok", authMode: "Bearer" } : null
  ),
}));

import { POST } from "./route";
import { JiraRequestError } from "@/lib/jira/client";

describe("POST /api/issues/[key]/worklogs", () => {
  const params = Promise.resolve({ key: "EPM-123" });
  const validBody: import("@/lib/worklogs/schema").CreateWorklogInput = {
    timeSpent: "2h 30m",
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    comment: "Fixed issue with standardization",
    adjustEstimate: "leave",
    idempotencyKey: "123e4567-e89b-12d3-a456-426614174000",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", email: "alice@example.com" } });
    mocks.user.mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      jiraTokenEnc: "encrypted-token",
    });
    mocks.worklogIdempotencyFindUnique.mockResolvedValue(null);
    mocks.worklogIdempotencyUpsert.mockResolvedValue({});
    mocks.worklogIdempotencyUpdate.mockResolvedValue({});
    mocks.addWorklog.mockResolvedValue({
      id: "worklog-999",
      timeSpentSeconds: 9000,
    });
    mocks.refreshJiraIssueCache.mockResolvedValue(true);
    mocks.audit.mockResolvedValue("audit-1");
  });

  it("returns 401 when not authenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 428 when user has not configured personal Jira credentials", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", jiraTokenEnc: null });
    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(428);
    const data = await res.json();
    expect(data.code).toBe("JIRA_CREDENTIALS_REQUIRED");
  });

  it("returns 400 when duration is missing or invalid", async () => {
    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify({ ...validBody, timeSpent: "invalid-time" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("INVALID_DURATION");
  });

  it("returns 409 when idempotency key is reused with different payload", async () => {
    mocks.worklogIdempotencyFindUnique.mockResolvedValue({
      key: validBody.idempotencyKey,
      requestHash: "different-hash",
      status: "succeeded",
    });

    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("DUPLICATE_REQUEST");
  });

  it("returns 200 duplicate replay when same idempotency key and payload already succeeded", async () => {
    const { computeWorklogRequestHash } = await import("@/lib/worklogs/schema");
    const hash = computeWorklogRequestHash(validBody);
    mocks.worklogIdempotencyFindUnique.mockResolvedValue({
      key: validBody.idempotencyKey,
      requestHash: hash,
      status: "succeeded",
      jiraWorklogId: "worklog-999",
      timeSpentSeconds: 9000,
      response: {
        jiraKey: "EPM-123",
        jiraWorklogId: "worklog-999",
        timeSpentSeconds: 9000,
        cacheSynced: true,
      },
    });

    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.duplicate).toBe(true);
    expect(data.jiraWorklogId).toBe("worklog-999");
    expect(mocks.addWorklog).not.toHaveBeenCalled();
  });

  it("creates worklog successfully, calls Jira with leave, syncs cache and writes audit without raw comment", async () => {
    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data).toEqual({
      jiraKey: "EPM-123",
      jiraWorklogId: "worklog-999",
      timeSpentSeconds: 9000,
      cacheSynced: true,
      duplicate: false,
    });

    // Check Jira was called with "leave"
    expect(mocks.addWorklog).toHaveBeenCalledWith(
      "EPM-123",
      expect.objectContaining({
        timeSpent: "2h 30m",
        comment: "Fixed issue with standardization",
      }),
      "leave"
    );

    // Check cache was refreshed
    expect(mocks.refreshJiraIssueCache).toHaveBeenCalledWith(
      expect.anything(),
      "EPM-123",
      { excludeUserId: "user-1" }
    );

    // Check audit was recorded without raw comment
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "issue.worklog_created",
        target: "EPM-123",
        after: expect.objectContaining({
          timeSpent: "2h 30m",
          timeSpentSeconds: 9000,
          jiraWorklogId: "worklog-999",
          commentLength: "Fixed issue with standardization".length,
        }),
      })
    );

    // Verify raw comment is NOT in audit after payload
    const auditCallArg = mocks.audit.mock.calls[0][0];
    expect(auditCallArg.after.comment).toBeUndefined();
  });

  it("handles Jira timeout as outcome_unknown and returns 504 without retrying", async () => {
    mocks.addWorklog.mockRejectedValue(
      new JiraRequestError("Jira POST worklog -> timeout", null, true)
    );

    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.code).toBe("OUTCOME_UNKNOWN");

    expect(mocks.worklogIdempotencyUpdate).toHaveBeenCalledWith({
      where: { key: validBody.idempotencyKey },
      data: expect.objectContaining({
        status: "outcome_unknown",
      }),
    });
  });

  it("handles Jira 403 as WORKLOG_FORBIDDEN", async () => {
    mocks.addWorklog.mockRejectedValue(
      new JiraRequestError("Jira POST worklog -> 403", 403, false)
    );

    const req = new Request("http://localhost/api/issues/EPM-123/worklogs", {
      method: "POST",
      body: JSON.stringify(validBody),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("WORKLOG_FORBIDDEN");
  });
});
