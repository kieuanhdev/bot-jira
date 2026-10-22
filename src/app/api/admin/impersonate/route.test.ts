import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isRealAdmin: vi.fn(),
  cookies: vi.fn(),
  userFindUnique: vi.fn(),
  recordActivity: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  isRealAdmin: mocks.isRealAdmin,
  IMPERSONATE_COOKIE_NAME: "botjira_impersonate",
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/activity/service", () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("POST & DELETE /api/admin/impersonate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST", () => {
    it("returns 403 if user is not real admin", async () => {
      mocks.getSession.mockResolvedValue({ user: { id: "m1", role: "member" } });
      mocks.isRealAdmin.mockReturnValue(false);

      const req = new NextRequest("http://localhost:3000/api/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "u2" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("returns 400 if targetUserId is missing", async () => {
      mocks.getSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
      mocks.isRealAdmin.mockReturnValue(true);

      const req = new NextRequest("http://localhost:3000/api/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 if target user is not found", async () => {
      mocks.getSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
      mocks.isRealAdmin.mockReturnValue(true);
      mocks.userFindUnique.mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "non-existent" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
    });

    it("sets cookie and records activity on success", async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: "a1", name: "Admin", role: "admin" },
      });
      mocks.isRealAdmin.mockReturnValue(true);

      mocks.userFindUnique.mockResolvedValue({
        id: "target-1",
        displayName: "Target User",
        email: "target@corp.com",
        jiraUsername: "target.user",
        role: "member",
      });

      const cookieSet = vi.fn();
      mocks.cookies.mockResolvedValue({ set: cookieSet });

      const req = new NextRequest("http://localhost:3000/api/admin/impersonate", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "target-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.user.displayName).toBe("Target User");

      expect(cookieSet).toHaveBeenCalledWith(
        "botjira_impersonate",
        "target-1",
        expect.objectContaining({ httpOnly: true, path: "/" })
      );

      expect(mocks.recordActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "auth.impersonate.start",
        })
      );
    });
  });

  describe("DELETE", () => {
    it("deletes cookie and records activity when stopping impersonation", async () => {
      mocks.getSession.mockResolvedValue({
        user: { id: "u2", role: "member" },
        impersonator: { id: "a1", name: "Admin", role: "admin" },
      });
      mocks.isRealAdmin.mockReturnValue(true);

      const cookieDelete = vi.fn();
      mocks.cookies.mockResolvedValue({ delete: cookieDelete });

      const res = await DELETE();
      expect(res.status).toBe(200);

      expect(cookieDelete).toHaveBeenCalledWith("botjira_impersonate");
      expect(mocks.recordActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "auth.impersonate.stop",
        })
      );
    });
  });
});
