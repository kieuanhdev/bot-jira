import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaMock, sessionMock } = vi.hoisted(() => ({
  prismaMock: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  sessionMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));

import { GET, encodeCursor, decodeCursor } from "./route";
import { POST as markReadPOST } from "./mark-read/route";

describe("cursor encode/decode", () => {
  it("encodes and decodes accurately", () => {
    const d = new Date("2026-09-24T12:00:00.000Z");
    const id = "notif_123";
    const cursor = encodeCursor(d, id);
    const decoded = decodeCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded?.createdAt.toISOString()).toBe(d.toISOString());
    expect(decoded?.id).toBe(id);
  });

  it("returns null for malformed cursor", () => {
    expect(decodeCursor("invalid-base64")).toBeNull();
  });
});

describe("GET /api/notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const req = new Request("http://localhost/api/notify");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns items, unreadCount, and nextCursor for authenticated user", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    const now = new Date();
    const fakeItems = [
      { id: "1", type: "comment", severity: "info", title: "A", body: "", link: null, read: false, createdAt: now },
      { id: "2", type: "stale", severity: "warning", title: "B", body: "", link: null, read: true, createdAt: now },
      { id: "3", type: "system", severity: "info", title: "C", body: "", link: null, read: true, createdAt: now },
    ];
    prismaMock.notification.findMany.mockResolvedValue(fakeItems);
    prismaMock.notification.count.mockResolvedValue(1);

    const req = new Request("http://localhost/api/notify?limit=2");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.unreadCount).toBe(1);
    expect(data.items.length).toBe(2);
    expect(data.nextCursor).toBeDefined();
    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1" }),
        take: 3,
      })
    );
  });
});

describe("POST /api/notify/mark-read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks specific ids as read", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.notification.count.mockResolvedValue(0);

    const req = new Request("http://localhost/api/notify/mark-read", {
      method: "POST",
      body: JSON.stringify({ ids: ["n1", "n2"] }),
    });
    const res = await markReadPOST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.unreadCount).toBe(0);
    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", id: { in: ["n1", "n2"] } },
        data: expect.objectContaining({ read: true }),
      })
    );
  });

  it("marks all as read for current user", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 5 });
    prismaMock.notification.count.mockResolvedValue(0);

    const req = new Request("http://localhost/api/notify/mark-read", {
      method: "POST",
      body: JSON.stringify({ all: true }),
    });
    const res = await markReadPOST(req);
    expect(res.status).toBe(200);

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user_1", read: false }),
        data: expect.objectContaining({ read: true }),
      })
    );
  });

  it("supports marking as unread", async () => {
    sessionMock.mockResolvedValue({ user: { id: "user_1" } });
    prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.notification.count.mockResolvedValue(1);

    const req = new Request("http://localhost/api/notify/mark-read", {
      method: "POST",
      body: JSON.stringify({ ids: ["n1"], unread: true }),
    });
    const res = await markReadPOST(req);
    expect(res.status).toBe(200);

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1", id: { in: ["n1"] } },
        data: { read: false, readAt: null },
      })
    );
  });
});
