import { describe, it, expect, vi, beforeEach } from "vitest";
import { encodeCursor, decodeCursor, listNotifications } from "./list";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("src/lib/notify/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("encodeCursor and decodeCursor", () => {
    it("round-trips a valid Date and ID", () => {
      const date = new Date("2026-10-16T10:00:00.000Z");
      const id = "notif-123";
      const cursor = encodeCursor(date, id);
      expect(typeof cursor).toBe("string");

      const decoded = decodeCursor(cursor);
      expect(decoded).not.toBeNull();
      expect(decoded?.createdAt.toISOString()).toBe(date.toISOString());
      expect(decoded?.id).toBe(id);
    });

    it("returns null for malformed or corrupted cursors", () => {
      expect(decodeCursor("invalid-base64-not-encoded")).toBeNull();
      // Valid base64 but missing underscore separator
      const noUnderscore = Buffer.from("justastring").toString("base64url");
      expect(decodeCursor(noUnderscore)).toBeNull();

      // Underscore present but invalid date
      const badDate = Buffer.from("invaliddate_id1").toString("base64url");
      expect(decodeCursor(badDate)).toBeNull();

      // Underscore present but empty id
      const emptyId = Buffer.from("2026-10-16T10:00:00.000Z_").toString("base64url");
      expect(decodeCursor(emptyId)).toBeNull();
    });
  });

  describe("listNotifications", () => {
    it("fetches notifications with default parameters and serializes Date objects to strings", async () => {
      const now = new Date("2026-10-16T12:00:00.000Z");
      const mockNotifications = [
        {
          id: "notif-1",
          type: "task_assigned",
          severity: "info",
          title: "Assigned to PROJ-1",
          body: "You have been assigned",
          link: "/issue/PROJ-1",
          sourceLink: null,
          sourceType: "jira",
          read: false,
          readAt: null,
          eventKey: "assign-1",
          createdAt: now,
        },
      ];

      prismaMock.notification.findMany.mockResolvedValueOnce(mockNotifications);
      prismaMock.notification.count.mockResolvedValueOnce(1);

      const result = await listNotifications("user-1");

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 21,
        select: expect.any(Object),
      });
      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: { userId: "user-1", read: false },
      });

      expect(result.unreadCount).toBe(1);
      expect(result.nextCursor).toBeNull();
      expect(result.items).toHaveLength(1);
      // Ensures JSON serialization (Date -> string)
      expect(typeof result.items[0].createdAt).toBe("string");
      expect(result.items[0].createdAt).toBe(now.toISOString());
    });

    it("paginates with nextCursor when items exceed limit", async () => {
      const date1 = new Date("2026-10-16T12:00:00.000Z");
      const date2 = new Date("2026-10-16T11:00:00.000Z");
      const date3 = new Date("2026-10-16T10:00:00.000Z");

      const mockNotifications = [
        { id: "n1", createdAt: date1, read: false },
        { id: "n2", createdAt: date2, read: false },
        { id: "n3", createdAt: date3, read: false },
      ];

      prismaMock.notification.findMany.mockResolvedValueOnce(mockNotifications);
      prismaMock.notification.count.mockResolvedValueOnce(5);

      const result = await listNotifications("user-1", { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe("n1");
      expect(result.items[1].id).toBe("n2");
      expect(result.nextCursor).toBe(encodeCursor(date2, "n2"));
    });

    it("applies unreadOnly, type, and cursor filters", async () => {
      const cursorDate = new Date("2026-10-15T00:00:00.000Z");
      const cursor = encodeCursor(cursorDate, "cur-id");

      prismaMock.notification.findMany.mockResolvedValueOnce([]);
      prismaMock.notification.count.mockResolvedValueOnce(0);

      await listNotifications("user-2", {
        limit: 10,
        unreadOnly: true,
        type: "system",
        cursor,
      });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-2",
          read: false,
          type: "system",
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: "cur-id" } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 11,
        select: expect.any(Object),
      });
    });
  });
});
