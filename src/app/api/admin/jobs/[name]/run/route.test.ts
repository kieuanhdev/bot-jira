import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  send: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));

vi.mock("@/lib/queue/boss", () => ({
  startBoss: async () => ({
    send: mocks.send,
  }),
}));

vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));

import { POST } from "./route";

const makeCtx = (name: string) => ({ params: Promise.resolve({ name }) });

describe("POST /api/admin/jobs/[name]/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", role: "admin" },
    });
    mocks.send.mockResolvedValue("job-123");
    mocks.audit.mockResolvedValue("audit-123");
  });

  it("returns 401 for unauthenticated user", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), makeCtx("check-branches"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "u-1", email: "u@x", role: "member" },
    });
    const res = await POST(new Request("http://localhost"), makeCtx("check-branches"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for job not in allowlist", async () => {
    const res = await POST(new Request("http://localhost"), makeCtx("bulk-op"));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("allowlist");
  });

  it("returns 409 when job is already running or queued (singleton returns null)", async () => {
    mocks.send.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost"), makeCtx("check-branches"));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("already queued");
  });

  it("queues allowed job and records audit log", async () => {
    const res = await POST(new Request("http://localhost"), makeCtx("check-branches"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true, jobId: "job-123", name: "check-branches" });

    expect(mocks.send).toHaveBeenCalledWith(
      "check-branches",
      {},
      expect.objectContaining({
        singletonKey: "check-branches:manual",
        singletonSeconds: 30,
        retryLimit: 0,
      })
    );

    expect(mocks.audit).toHaveBeenCalledWith({
      actorId: "admin-1",
      actorEmail: "admin@example.com",
      action: "admin.job.run",
      target: "check-branches",
      source: "web",
    });
  });
});
