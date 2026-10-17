import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  updateMany: vi.fn(),
  enqueue: vi.fn(),
  audit: vi.fn(),
  hasInflight: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { sentryIssueImported: { updateMany: mocks.updateMany } },
}));

vi.mock("@/lib/queue/boss", () => ({ enqueueSentryImport: mocks.enqueue }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/sentry/create-from-form", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sentry/create-from-form")>()),
  hasInflightSentryOp: mocks.hasInflight,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/admin/sentry-import/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", email: "admin@example.com", role: "admin" } });
    mocks.updateMany.mockResolvedValue({ count: 2 });
    mocks.enqueue.mockResolvedValue("job-1");
    mocks.hasInflight.mockResolvedValue(false);
  });

  it("does not approve rows whose single-issue form op is still in flight", async () => {
    mocks.hasInflight.mockImplementation(async (id: string) => id === "b");
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const res = await post({ ids: ["a", "b"], decision: "approve" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ updated: 1, skipped: 1, state: "approved" });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["a"] }, state: { in: ["review", "pending", "rejected"] } } })
    );
  });

  it("returns 409 when every row to approve has an in-flight form op", async () => {
    mocks.hasInflight.mockResolvedValue(true);

    const res = await post({ ids: ["a"], decision: "approve" });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Task cho lỗi này đang được tạo");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not check in-flight ops for reject", async () => {
    await post({ ids: ["a"], decision: "reject" });
    expect(mocks.hasInflight).not.toHaveBeenCalled();
  });

  it("rejects non-admins", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u", role: "member" } });
    const res = await post({ ids: ["a"], decision: "approve" });
    expect(res.status).toBe(403);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("validates ids and decision", async () => {
    expect((await post({ ids: [], decision: "approve" })).status).toBe(400);
    expect((await post({ ids: ["a"], decision: "delete" })).status).toBe(400);
  });

  it("approves only rows still waiting for review and triggers the import", async () => {
    const res = await post({ ids: ["a", "b"], decision: "approve" });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ updated: 2, state: "approved", queued: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, state: { in: ["review", "pending", "rejected"] } },
      data: expect.objectContaining({ state: "approved", reviewedBy: "admin@example.com", attemptCount: 0 }),
    });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.sentry.approve" }));
  });

  it("rejects without triggering the import", async () => {
    const res = await post({ ids: ["a"], decision: "reject" });

    expect(res.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["a"] }, state: { in: ["review", "pending"] } } })
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("returns 409 when another reviewer already decided", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ ids: ["a"], decision: "approve" });
    expect(res.status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  describe("edits to the generated Jira task", () => {
    beforeEach(() => mocks.updateMany.mockResolvedValue({ count: 1 }));

    it("stores an edited summary and description for a single approval", async () => {
      const res = await post({ ids: ["a"], decision: "approve", summary: "  Lỗi thanh toán  ", description: "Chi tiết" });

      expect(res.status).toBe(200);
      expect(mocks.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ draftSummary: "Lỗi thanh toán", draftDescription: "Chi tiết" }),
        })
      );
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.objectContaining({ after: expect.objectContaining({ edited: true }) })
      );
    });

    it("ignores edits on a bulk approval and on other decisions", async () => {
      await post({ ids: ["a", "b"], decision: "approve", summary: "x" });
      await post({ ids: ["a"], decision: "reject", summary: "x" });

      for (const call of mocks.updateMany.mock.calls) {
        expect(call[0].data).not.toHaveProperty("draftSummary");
      }
    });

    it("rejects an empty, multi-line or oversized summary and an oversized description", async () => {
      for (const summary of ["   ", "a\nb", "x".repeat(256)]) {
        expect((await post({ ids: ["a"], decision: "approve", summary })).status).toBe(400);
      }
      expect((await post({ ids: ["a"], decision: "approve", description: "x".repeat(30_001) })).status).toBe(400);
      expect(mocks.updateMany).not.toHaveBeenCalled();
    });
  });
});
