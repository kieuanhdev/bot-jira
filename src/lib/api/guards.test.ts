import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

import { requireSession, requireAdmin } from "./guards";

describe("API auth guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireSession", () => {
    it("returns 401 unauthorized when session is null", async () => {
      mocks.session.mockResolvedValue(null);

      const res = await requireSession();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.response.status).toBe(401);
        await expect(res.response.json()).resolves.toEqual({ error: "unauthorized" });
      }
    });

    it("returns 401 unauthorized when user or user.id is missing", async () => {
      mocks.session.mockResolvedValue({ user: null });

      const res1 = await requireSession();
      expect(res1.ok).toBe(false);
      if (!res1.ok) {
        expect(res1.response.status).toBe(401);
      }

      mocks.session.mockResolvedValue({ user: { id: "" } });
      const res2 = await requireSession();
      expect(res2.ok).toBe(false);
      if (!res2.ok) {
        expect(res2.response.status).toBe(401);
      }
    });

    it("returns ok with typed session when valid session exists", async () => {
      mocks.session.mockResolvedValue({
        user: { id: "user-1", email: "user@example.com", role: "member" },
      });

      const res = await requireSession();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.session.user.id).toBe("user-1");
        expect(res.session.user.email).toBe("user@example.com");
      }
    });
  });

  describe("requireAdmin", () => {
    it("returns 401 unauthorized when session is missing", async () => {
      mocks.session.mockResolvedValue(null);

      const res = await requireAdmin();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.response.status).toBe(401);
        await expect(res.response.json()).resolves.toEqual({ error: "unauthorized" });
      }
    });

    it("returns 403 forbidden when user is not an admin", async () => {
      mocks.session.mockResolvedValue({
        user: { id: "user-2", role: "member" },
      });

      const res = await requireAdmin();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.response.status).toBe(403);
        await expect(res.response.json()).resolves.toEqual({ error: "forbidden" });
      }
    });

    it("returns ok with typed session when user has admin role", async () => {
      mocks.session.mockResolvedValue({
        user: { id: "admin-1", role: "admin" },
      });

      const res = await requireAdmin();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.session.user.id).toBe("admin-1");
        expect(res.session.user.role).toBe("admin");
      }
    });
  });
});
