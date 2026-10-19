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
  bulkOpFindUnique: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
  assertSentryRowAccess: mocks.assertAccess,
  resolveRowTargetProject: (r: { targetProject: string }) => r.targetProject,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    bulkOperation: { findUnique: mocks.bulkOpFindUnique },
  },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userJiraAuth }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: vi.fn().mockReturnValue({}),
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

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/sentry/bulk-create", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/sentry/bulk-create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", email: "user@example.com", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValue({ all: false, projects: ["EPM"] });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.userJiraAuth.mockReturnValue({ user: "u", token: "tok" });
    mocks.probeJiraAuth.mockResolvedValue(true);
    mocks.hasInflight.mockResolvedValue(false);
  });

  describe("preview", () => {
    it("returns 400 when ids array is empty", async () => {
      const res = await post({ ids: [] });
      expect(res.status).toBe(400);
    });

    it("returns 400 instead of silently dropping ids above the limit", async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `r${i}`);
      const res = await post({ ids });
      expect(res.status).toBe(400);
      expect(mocks.assertAccess).not.toHaveBeenCalled();
    });

    it("dedupes repeated ids before building items", async () => {
      mocks.assertAccess.mockResolvedValueOnce({
        id: "r1",
        state: "review",
        targetProject: "EPM",
        sentryIssueId: "1",
        title: "Error 1",
      });
      mocks.previewBulkCreate.mockResolvedValueOnce({ operationId: "op-1", total: 1, actionable: 1, blocked: 0 });

      const res = await post({ ids: ["r1", "r1", " r1 "] });
      expect(res.status).toBe(200);
      expect(mocks.assertAccess).toHaveBeenCalledTimes(1);
      const request = mocks.previewBulkCreate.mock.calls[0][3];
      expect(request.items).toHaveLength(1);
      expect(request.source).toEqual({ type: "sentry", sentryImportIds: ["r1"] });
    });

    it("returns 404 if any id is outside scope", async () => {
      mocks.assertAccess.mockRejectedValueOnce(new Error("not in scope"));
      const res = await post({ ids: ["r1", "r2"] });
      expect(res.status).toBe(404);
    });

    it("returns 400 if rows belong to multiple target projects", async () => {
      mocks.assertAccess
        .mockResolvedValueOnce({ id: "r1", state: "review", targetProject: "EPM", sentryIssueId: "1" })
        .mockResolvedValueOnce({ id: "r2", state: "review", targetProject: "MHRM", sentryIssueId: "2" });

      const res = await post({ ids: ["r1", "r2"] });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("cùng một dự án");
    });

    it("creates preview for multiple Sentry rows in the same project", async () => {
      mocks.assertAccess
        .mockResolvedValueOnce({ id: "r1", state: "review", targetProject: "EPM", sentryIssueId: "1", title: "Error 1" })
        .mockResolvedValueOnce({ id: "r2", state: "review", targetProject: "EPM", sentryIssueId: "2", title: "Error 2" });
      mocks.previewBulkCreate.mockResolvedValueOnce({
        operationId: "op-bulk-1",
        total: 2,
        actionable: 2,
        blocked: 0,
      });

      const res = await post({ ids: ["r1", "r2"] });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.operationId).toBe("op-bulk-1");
      expect(mocks.previewBulkCreate).toHaveBeenCalledWith(
        "user-1",
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          projectKey: "EPM",
          source: { type: "sentry", sentryImportIds: ["r1", "r2"] },
          items: expect.arrayContaining([
            expect.objectContaining({ clientRef: "sentry-r1" }),
            expect.objectContaining({ clientRef: "sentry-r2" }),
          ]),
        })
      );
    });
  });

  describe("confirm", () => {
    it("confirms a multi-row sentry op", async () => {
      mocks.bulkOpFindUnique.mockResolvedValueOnce({
        id: "op-bulk-1",
        payload: {
          projectKey: "EPM",
          source: { type: "sentry", sentryImportIds: ["r1", "r2"] },
        },
      });
      mocks.assertAccess.mockResolvedValue({ id: "r1" });
      mocks.confirmSentryCreate.mockResolvedValueOnce({
        ok: true,
        result: { operationId: "op-bulk-1", total: 2, actionable: 2, blocked: 0 },
      });
      mocks.enqueueBulkOperation.mockResolvedValueOnce("job-bulk");

      const res = await post({ confirm: true, operationId: "op-bulk-1" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        operationId: "op-bulk-1",
        total: 2,
        actionable: 2,
        blocked: 0,
        queued: true,
      });
      expect(mocks.confirmSentryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sentryImportIds: ["r1", "r2"],
          operationId: "op-bulk-1",
          reviewer: "user@example.com",
        })
      );
      expect(mocks.enqueueBulkOperation).toHaveBeenCalledWith("op-bulk-1");
    });
  });
});
