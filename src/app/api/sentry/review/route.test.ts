import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  updateMany: vi.fn(),
  audit: vi.fn(),
  sentryScopeFor: vi.fn(),
  assertSentryRowAccess: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { sentryIssueImported: { updateMany: mocks.updateMany } },
}));

vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
  assertSentryRowAccess: mocks.assertSentryRowAccess,
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/sentry/review", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/sentry/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", email: "user@example.com", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValue({ all: false, projects: ["EPM"] });
    mocks.assertSentryRowAccess.mockResolvedValue({ id: "r1" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await post({ ids: ["r1"], decision: "reject" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when ids are missing", async () => {
    const res = await post({ ids: [], decision: "reject" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when decision is approve", async () => {
    const res = await post({ ids: ["r1"], decision: "approve" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("bulk-create");
  });

  it("returns 400 for unknown decision", async () => {
    const res = await post({ ids: ["r1"], decision: "unknown" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when an id is not accessible in scope", async () => {
    mocks.assertSentryRowAccess.mockRejectedValueOnce(new Error("not in scope"));
    const res = await post({ ids: ["r1"], decision: "reject" });
    expect(res.status).toBe(404);
  });

  it("successfully rejects issues in review/pending states", async () => {
    const res = await post({ ids: ["r1"], decision: "reject" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, updated: 1, state: "rejected" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1"] }, state: { in: ["review", "pending"] } },
      data: {
        state: "rejected",
        reviewedBy: "user@example.com",
        reviewedAt: expect.any(Date),
      },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentry.reject",
        target: "r1",
      })
    );
  });

  it("successfully reopens rejected issues", async () => {
    const res = await post({ ids: ["r1"], decision: "reopen" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, updated: 1, state: "review" });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["r1"] }, state: { in: ["rejected"] } },
      data: {
        state: "review",
        reviewedBy: "user@example.com",
        reviewedAt: expect.any(Date),
      },
    });
  });

  it("returns 409 when no rows matched the from-state", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await post({ ids: ["r1"], decision: "reject" });
    expect(res.status).toBe(409);
  });
});
