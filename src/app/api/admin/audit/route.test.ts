import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findManyAudit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: mocks.findManyAudit,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", role: "admin" },
    });
    mocks.findManyAudit.mockResolvedValue([]);
  });

  it("returns 401 for unauthenticated request", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/audit"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin request", async () => {
    mocks.session.mockResolvedValue({ user: { id: "u-1", role: "member" } });
    const res = await GET(new Request("http://localhost/api/admin/audit"));
    expect(res.status).toBe(403);
  });

  it("returns recent audit logs", async () => {
    mocks.findManyAudit.mockResolvedValue([
      {
        id: "log-1",
        createdAt: new Date("2026-10-14T09:00:00Z"),
        actorEmail: "admin@example.com",
        action: "admin.job.run",
        target: "check-branches",
        source: "web",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/admin/audit?limit=10"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([
      {
        id: "log-1",
        createdAt: "2026-10-14T09:00:00.000Z",
        actorEmail: "admin@example.com",
        action: "admin.job.run",
        target: "check-branches",
        source: "web",
      },
    ]);
  });
});
