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
    releaseGateOverride: {
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

const ctx = (id = "r1", overrideId?: string) => ({
  params: Promise.resolve({ id, overrideId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", email: "mgr@test.io", role: "release_manager" } });
  canMock.mockReturnValue(true);
  prismaMock.release.findUnique.mockResolvedValue({ id: "r1" });
});

describe("POST /api/releases/:id/overrides", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(new Request("http://x/api/releases/r1/overrides", { method: "POST" }), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks release.approve permission", async () => {
    canMock.mockReturnValue(false);
    const res = await POST(new Request("http://x/api/releases/r1/overrides", { method: "POST" }), ctx());
    expect(res.status).toBe(403);
  });

  it("returns 400 when gate is missing", async () => {
    const res = await POST(
      new Request("http://x/api/releases/r1/overrides", {
        method: "POST",
        body: JSON.stringify({ reason: "Needed" }),
      }),
      ctx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("gate required");
  });

  it("returns 400 when reason is missing", async () => {
    const res = await POST(
      new Request("http://x/api/releases/r1/overrides", {
        method: "POST",
        body: JSON.stringify({ gate: "data_freshness" }),
      }),
      ctx()
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("reason required");
  });

  it("returns 400 when attempting to override non-overridable gates", async () => {
    for (const gate of ["non_empty_release", "ci"]) {
      const res = await POST(
        new Request("http://x/api/releases/r1/overrides", {
          method: "POST",
          body: JSON.stringify({ gate, reason: "Bypass test" }),
        }),
        ctx()
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe(`gate "${gate}" cannot be overridden`);
    }
  });

  it("returns 404 when release not found", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);
    const res = await POST(
      new Request("http://x/api/releases/r1/overrides", {
        method: "POST",
        body: JSON.stringify({ gate: "data_freshness", reason: "Offline maintenance" }),
      }),
      ctx()
    );
    expect(res.status).toBe(404);
  });

  it("creates override and audits on valid input", async () => {
    prismaMock.releaseGateOverride.create.mockResolvedValue({
      id: "ov-1",
      gate: "data_freshness",
      reason: "Offline maintenance",
    });

    const res = await POST(
      new Request("http://x/api/releases/r1/overrides", {
        method: "POST",
        body: JSON.stringify({ gate: "data_freshness", reason: "Offline maintenance" }),
      }),
      ctx()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.override).toHaveProperty("id", "ov-1");
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "release.override" })
    );
  });
});

describe("DELETE /api/releases/:id/overrides", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/api/releases/r1/overrides?overrideId=ov-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks release.approve permission", async () => {
    canMock.mockReturnValue(false);
    const res = await DELETE(new Request("http://x/api/releases/r1/overrides?overrideId=ov-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(403);
  });

  it("returns 400 when overrideId is missing", async () => {
    const res = await DELETE(new Request("http://x/api/releases/r1/overrides", { method: "DELETE" }), ctx());
    expect(res.status).toBe(400);
  });

  it("returns 404 when override does not exist or releaseId mismatch", async () => {
    prismaMock.releaseGateOverride.findUnique.mockResolvedValue(null);
    const res = await DELETE(new Request("http://x/api/releases/r1/overrides?overrideId=ov-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(404);
  });

  it("revokes override and audits on success", async () => {
    prismaMock.releaseGateOverride.findUnique.mockResolvedValue({
      id: "ov-1",
      releaseId: "r1",
      gate: "data_freshness",
    });
    prismaMock.releaseGateOverride.update.mockResolvedValue({
      id: "ov-1",
      gate: "data_freshness",
      revokedAt: new Date(),
    });

    const res = await DELETE(new Request("http://x/api/releases/r1/overrides?overrideId=ov-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "release.override_revoke" })
    );
  });
});
