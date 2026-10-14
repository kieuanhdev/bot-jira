import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findManyOutbox: vi.fn(),
  findManyUsers: vi.fn(),
  updateManyOutbox: vi.fn(),
  enqueueNotificationDelivery: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationOutbox: {
      findMany: mocks.findManyOutbox,
      updateMany: mocks.updateManyOutbox,
    },
    user: {
      findMany: mocks.findManyUsers,
    },
  },
}));

vi.mock("@/lib/queue/enqueue", () => ({
  enqueueNotificationDelivery: mocks.enqueueNotificationDelivery,
}));

vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));

import { GET } from "./route";
import { POST as RETRY_POST } from "./retry/route";

describe("/api/admin/outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", role: "admin" },
    });
    mocks.findManyOutbox.mockResolvedValue([]);
    mocks.findManyUsers.mockResolvedValue([]);
    mocks.updateManyOutbox.mockResolvedValue({ count: 0 });
    mocks.enqueueNotificationDelivery.mockResolvedValue("job-1");
  });

  describe("GET", () => {
    it("returns 401 for unauthenticated request", async () => {
      mocks.session.mockResolvedValue(null);
      const res = await GET(new Request("http://localhost/api/admin/outbox"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      mocks.session.mockResolvedValue({ user: { id: "u-1", role: "member" } });
      const res = await GET(new Request("http://localhost/api/admin/outbox"));
      expect(res.status).toBe(403);
    });

    it("lists failed outbox notifications with masked errors and user emails", async () => {
      mocks.findManyOutbox.mockResolvedValue([
        {
          id: "ob-1",
          channel: "push",
          userId: "user-1",
          title: "New issue assigned",
          attemptCount: 3,
          lastError: "Invalid token=secret_token_123",
          createdAt: new Date("2026-10-14T08:00:00Z"),
          updatedAt: new Date("2026-10-14T08:05:00Z"),
        },
      ]);
      mocks.findManyUsers.mockResolvedValue([
        { id: "user-1", email: "dev@example.com", displayName: "Developer" },
      ]);

      const res = await GET(new Request("http://localhost/api/admin/outbox?state=failed"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toEqual({
        id: "ob-1",
        channel: "push",
        userId: "user-1",
        userEmail: "dev@example.com",
        userDisplayName: "Developer",
        title: "New issue assigned",
        attemptCount: 3,
        lastError: "Invalid token=***",
        createdAt: "2026-10-14T08:00:00.000Z",
        updatedAt: "2026-10-14T08:05:00.000Z",
      });
    });
  });

  describe("POST /retry", () => {
    it("returns 401 for unauthenticated request", async () => {
      mocks.session.mockResolvedValue(null);
      const res = await RETRY_POST(new Request("http://localhost/api/admin/outbox/retry", { method: "POST" }));
      expect(res.status).toBe(401);
    });

    it("resets failed notifications and triggers queue delivery with audit log", async () => {
      mocks.findManyOutbox.mockResolvedValue([{ id: "ob-1" }, { id: "ob-2" }]);
      mocks.updateManyOutbox.mockResolvedValue({ count: 2 });

      const res = await RETRY_POST(
        new Request("http://localhost/api/admin/outbox/retry", {
          method: "POST",
          body: JSON.stringify({ ids: ["ob-1", "ob-2"] }),
        })
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ ok: true, count: 2 });

      expect(mocks.updateManyOutbox).toHaveBeenCalledWith({
        where: { id: { in: ["ob-1", "ob-2"] } },
        data: {
          state: "pending",
          attemptCount: 0,
          scheduledAt: null,
          lastError: null,
        },
      });

      expect(mocks.enqueueNotificationDelivery).toHaveBeenCalled();
      expect(mocks.audit).toHaveBeenCalledWith({
        actorId: "admin-1",
        actorEmail: "admin@example.com",
        action: "admin.outbox.retry",
        target: "2 notifications",
        source: "web",
      });
    });
  });
});
