import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  assertAccess: vi.fn(),
  sentryScopeFor: vi.fn(),
  userFindUnique: vi.fn(),
  userJiraAuth: vi.fn(),
  probeJiraAuth: vi.fn(),
  previewBulkCreate: vi.fn(),
  confirmBulkCreate: vi.fn(),
  enqueueBulkOperation: vi.fn(),
  hasInflight: vi.fn(),
  confirmSentryCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
  assertSentryRowAccess: mocks.assertAccess,
  resolveRowTargetProject: (r: { targetProject: string }) => r.targetProject,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userJiraAuth }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: vi.fn(),
  probeJiraAuth: mocks.probeJiraAuth,
  JiraRequestError: class extends Error {},
}));
vi.mock("@/lib/bulk/create-ops", () => ({
  previewBulkCreate: mocks.previewBulkCreate,
  confirmBulkCreate: mocks.confirmBulkCreate,
}));
vi.mock("@/lib/queue/boss", () => ({ enqueueBulkOperation: mocks.enqueueBulkOperation }));
vi.mock("@/lib/sentry/create-from-form", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sentry/create-from-form")>()),
  hasInflightSentryOp: mocks.hasInflight,
  confirmSentryCreate: mocks.confirmSentryCreate,
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { POST } from "./route";

const post = (body: unknown, id = "row-1") =>
  POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

const dbRow = {
  id: "row-1",
  sentryProject: "web",
  sentryIssueId: "123",
  targetProject: "EPM",
  state: "review",
};

describe("POST /api/sentry/[id]/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", email: "user@example.com", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValue({ all: false, projects: ["EPM"] });
    mocks.assertAccess.mockResolvedValue(dbRow);
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.userJiraAuth.mockReturnValue({ user: "u", token: "tok" });
    mocks.probeJiraAuth.mockResolvedValue(true);
    mocks.hasInflight.mockResolvedValue(false);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await post({ row: { summary: "Bug" } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when row is outside scope", async () => {
    mocks.assertAccess.mockRejectedValueOnce(new Error("not found"));
    const res = await post({ row: { summary: "Bug" } });
    expect(res.status).toBe(404);
  });

  it("returns 428 when user has no Jira credentials", async () => {
    mocks.userJiraAuth.mockReturnValueOnce(null);
    const res = await post({ row: { summary: "Bug" } });
    expect(res.status).toBe(428);
  });

  it("returns preview result on preview flow", async () => {
    mocks.previewBulkCreate.mockResolvedValueOnce({
      operationId: "op-1",
      total: 1,
      actionable: 1,
      blocked: 0,
    });

    const res = await post({ row: { summary: "Fix bug", issueTypeId: "1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.operationId).toBe("op-1");
    expect(mocks.previewBulkCreate).toHaveBeenCalledTimes(1);
  });

  it("confirms and enqueues on confirm flow", async () => {
    mocks.confirmSentryCreate.mockResolvedValueOnce({
      ok: true,
      result: { operationId: "op-1", total: 1, actionable: 1, blocked: 0 },
    });
    mocks.enqueueBulkOperation.mockResolvedValueOnce("job-123");

    const res = await post({ confirm: true, operationId: "op-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      operationId: "op-1",
      total: 1,
      actionable: 1,
      blocked: 0,
      queued: true,
    });
    expect(mocks.confirmSentryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        sentryImportId: "row-1",
        operationId: "op-1",
        reviewer: "user@example.com",
      })
    );
    expect(mocks.enqueueBulkOperation).toHaveBeenCalledWith("op-1");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentry.create_form",
        target: "row-1",
      })
    );
  });
});
