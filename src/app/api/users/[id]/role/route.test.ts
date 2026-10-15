import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: vi.fn((s) => s?.user?.role === "admin"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      count: mocks.userCount,
      update: mocks.userUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));

import { PATCH } from "./route";

describe("PATCH /api/users/[id]/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", role: "admin" },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "target-1",
      role: "member",
      email: "target@example.com",
    });
    mocks.userCount.mockResolvedValue(2);
    mocks.userUpdate.mockResolvedValue({
      id: "target-1",
      role: "lead",
    });
    mocks.transaction.mockImplementation(async (cb) => {
      return cb({
        user: {
          count: mocks.userCount,
          update: mocks.userUpdate,
        },
      });
    });
    mocks.audit.mockResolvedValue("audit-1");
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("http://localhost/api/users/target-1/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "lead" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is non-admin", async () => {
    mocks.session.mockResolvedValue({
      user: { id: "user-2", email: "user@example.com", role: "member" },
    });
    const req = new Request("http://localhost/api/users/target-1/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "lead" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new Request("http://localhost/api/users/target-1/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{ not-json",
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("returns 400 on invalid role", async () => {
    const req = new Request("http://localhost/api/users/target-1/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "superadmin" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid role" });
  });

  it("returns 404 when target user is not found", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const req = new Request("http://localhost/api/users/non-existent/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "lead" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "user not found" });
  });

  it("returns 409 last_admin when demoting the last remaining admin", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "admin",
      email: "admin@example.com",
    });
    mocks.userCount.mockResolvedValue(1);

    const req = new Request("http://localhost/api/users/admin-1/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "member" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "admin-1" }) });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "last_admin" });
  });

  it("successfully updates role and calls audit", async () => {
    const req = new Request("http://localhost/api/users/target-1/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "lead" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "target-1" }) });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user: { id: "target-1", role: "lead" },
    });

    expect(mocks.audit).toHaveBeenCalledWith({
      actorId: "admin-1",
      actorEmail: "admin@example.com",
      action: "user.role_change",
      target: "target-1",
      before: { role: "member" },
      after: { role: "lead" },
    });
  });
});
