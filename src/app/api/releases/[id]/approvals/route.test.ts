import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, DELETE } from "./route";

const { prismaMock, sessionMock, canMock, auditMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const auditMock = vi.fn().mockResolvedValue("audit-1");
  const prismaMock = {
    release: {
      findUnique: vi.fn(),
    },
    releaseApproval: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prismaMock, sessionMock, canMock, auditMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: auditMock }));

const ctx = (id = "r1", approvalId?: string) => ({
  params: Promise.resolve({ id, approvalId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", email: "qa@test.io", role: "qa" } });
  canMock.mockReturnValue(true);
  prismaMock.release.findUnique.mockResolvedValue({ id: "r1" });
});

describe("POST /api/releases/:id/approvals", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(new Request("http://x/api/releases/r1/approvals", { method: "POST" }), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks release.approve permission", async () => {
    canMock.mockReturnValue(false);
    const res = await POST(new Request("http://x/api/releases/r1/approvals", { method: "POST" }), ctx());
    expect(res.status).toBe(403);
  });

  it("returns 404 when release not found", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);
    const res = await POST(new Request("http://x/api/releases/r1/approvals", { method: "POST" }), ctx());
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid approval type", async () => {
    const res = await POST(
      new Request("http://x/api/releases/r1/approvals", {
        method: "POST",
        body: JSON.stringify({ type: "invalid_type" }),
      }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("creates approval with inferred or explicit type and audits", async () => {
    prismaMock.releaseApproval.create.mockResolvedValue({ id: "app-1", type: "qa", note: "LGTM" });
    const res = await POST(
      new Request("http://x/api/releases/r1/approvals", {
        method: "POST",
        body: JSON.stringify({ type: "qa", note: "LGTM" }),
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approval).toEqual({ id: "app-1", type: "qa", note: "LGTM" });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "release.approve" })
    );
  });
});

describe("DELETE /api/releases/:id/approvals", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/api/releases/r1/approvals?approvalId=app-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks release.approve permission", async () => {
    canMock.mockReturnValue(false);
    const res = await DELETE(new Request("http://x/api/releases/r1/approvals?approvalId=app-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(403);
  });

  it("returns 400 when approvalId is missing", async () => {
    const res = await DELETE(new Request("http://x/api/releases/r1/approvals", { method: "DELETE" }), ctx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when approval does not exist or releaseId mismatch", async () => {
    prismaMock.releaseApproval.findUnique.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/api/releases/r1/approvals?approvalId=app-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the approver and not admin", async () => {
    prismaMock.releaseApproval.findUnique.mockResolvedValue({
      id: "app-1",
      releaseId: "r1",
      approvedById: "other-user",
    });
    sessionMock.mockResolvedValue({ user: { id: "u1", role: "member" } });

    const res = await DELETE(new Request("http://x/api/releases/r1/approvals?approvalId=app-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(403);
  });

  it("revokes approval when actor is the original approver", async () => {
    prismaMock.releaseApproval.findUnique.mockResolvedValue({
      id: "app-1",
      releaseId: "r1",
      approvedById: "u1",
    });
    prismaMock.releaseApproval.update.mockResolvedValue({ id: "app-1", revokedAt: new Date() });

    const res = await DELETE(new Request("http://x/api/releases/r1/approvals?approvalId=app-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "release.approve_revoke" })
    );
  });

  it("revokes approval when actor is an admin", async () => {
    prismaMock.releaseApproval.findUnique.mockResolvedValue({
      id: "app-1",
      releaseId: "r1",
      approvedById: "other-user",
    });
    sessionMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    prismaMock.releaseApproval.update.mockResolvedValue({ id: "app-1", revokedAt: new Date() });

    const res = await DELETE(new Request("http://x/api/releases/r1/approvals?approvalId=app-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
