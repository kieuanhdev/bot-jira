import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSession, isAdmin, isRealAdmin, isImpersonating, IMPERSONATE_COOKIE_NAME } from "./session";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  cookies: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("./prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("./auth", () => ({
  authOptions: {},
}));

describe("session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isAdmin, isRealAdmin, isImpersonating", () => {
    it("identifies standard admin", () => {
      const session = { user: { id: "u1", role: "admin" } };
      expect(isAdmin(session)).toBe(true);
      expect(isRealAdmin(session)).toBe(true);
      expect(isImpersonating(session)).toBe(false);
    });

    it("identifies member", () => {
      const session = { user: { id: "u2", role: "member" } };
      expect(isAdmin(session)).toBe(false);
      expect(isRealAdmin(session)).toBe(false);
      expect(isImpersonating(session)).toBe(false);
    });

    it("identifies admin impersonating a member", () => {
      const session = {
        user: { id: "u2", role: "member" },
        impersonator: { id: "u1", role: "admin" },
      };
      // Effective role is member (for UI)
      expect(isAdmin(session)).toBe(false);
      // Real underlying role is admin
      expect(isRealAdmin(session)).toBe(true);
      expect(isImpersonating(session)).toBe(true);
    });
  });

  describe("getSession", () => {
    it("returns null if no active session", async () => {
      mocks.getServerSession.mockResolvedValue(null);
      const res = await getSession();
      expect(res).toBeNull();
    });

    it("returns normal session for member even if cookie is present", async () => {
      mocks.getServerSession.mockResolvedValue({
        user: { id: "m1", name: "Member One", role: "member" },
      });
      const cookieGet = vi.fn().mockReturnValue({ value: "target-user" });
      mocks.cookies.mockResolvedValue({ get: cookieGet });

      const res = await getSession();
      expect(res?.user?.id).toBe("m1");
      expect(res?.user?.role).toBe("member");
      expect(res?.impersonator).toBeUndefined();
      expect(mocks.userFindUnique).not.toHaveBeenCalled();
    });

    it("returns target user session when real admin has impersonation cookie", async () => {
      mocks.getServerSession.mockResolvedValue({
        user: { id: "admin-1", name: "Admin Boss", email: "admin@corp.com", role: "admin", jiraUsername: "admin.boss" },
      });
      const cookieGet = vi.fn((name: string) => {
        if (name === IMPERSONATE_COOKIE_NAME) return { value: "user-2" };
        return undefined;
      });
      mocks.cookies.mockResolvedValue({ get: cookieGet });

      mocks.userFindUnique.mockResolvedValue({
        id: "user-2",
        displayName: "Target User",
        email: "target@corp.com",
        role: "member",
        jiraUsername: "target.user",
      });

      const res = await getSession();
      expect(res?.user?.id).toBe("user-2");
      expect(res?.user?.name).toBe("Target User");
      expect(res?.user?.role).toBe("member");
      expect(res?.impersonator).toEqual({
        id: "admin-1",
        name: "Admin Boss",
        email: "admin@corp.com",
        role: "admin",
        jiraUsername: "admin.boss",
      });
    });

    it("falls back to admin session if target user does not exist in DB", async () => {
      mocks.getServerSession.mockResolvedValue({
        user: { id: "admin-1", name: "Admin Boss", role: "admin" },
      });
      const cookieGet = vi.fn().mockReturnValue({ value: "non-existent" });
      mocks.cookies.mockResolvedValue({ get: cookieGet });

      mocks.userFindUnique.mockResolvedValue(null);

      const res = await getSession();
      expect(res?.user?.id).toBe("admin-1");
      expect(res?.impersonator).toBeUndefined();
    });
  });
});
