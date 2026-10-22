import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseUserAgent, sanitizePath, recordActivity } from "./service";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userActivity: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("activity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseUserAgent", () => {
    it("parses Windows Chrome", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      expect(parseUserAgent(ua)).toBe("Chrome · Windows");
    });

    it("parses macOS Safari", () => {
      const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
      expect(parseUserAgent(ua)).toBe("Safari · macOS");
    });

    it("parses Windows Edge", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
      expect(parseUserAgent(ua)).toBe("Edge · Windows");
    });

    it("handles null or undefined", () => {
      expect(parseUserAgent(null)).toBe("Không rõ");
      expect(parseUserAgent("")).toBe("Không rõ");
    });
  });

  describe("sanitizePath", () => {
    it("redacts secret tokens from query string", () => {
      const path = "/board?project=PAY&token=secret123&foo=bar";
      const sanitized = sanitizePath(path);
      expect(sanitized).toContain("token=%5Bredacted%5D");
      expect(sanitized).toContain("project=PAY");
      expect(sanitized).toContain("foo=bar");
    });

    it("leaves standard paths unchanged", () => {
      expect(sanitizePath("/releases")).toBe("/releases");
      expect(sanitizePath("/admin/overview?tab=jobs")).toBe("/admin/overview?tab=jobs");
    });
  });

  describe("recordActivity", () => {
    it("creates userActivity record in prisma", async () => {
      (prisma.userActivity.create as any).mockResolvedValueOnce({ id: "act_123" });

      const res = await recordActivity({
        userId: "u1",
        userName: "Dev A",
        userEmail: "deva@example.com",
        eventType: "page_view",
        action: "page.view",
        description: "Xem trang bảng",
        path: "/board",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        ipAddress: "127.0.0.1",
      });

      expect(res).toBe("act_123");
      expect(prisma.userActivity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "u1",
          userName: "Dev A",
          userEmail: "deva@example.com",
          eventType: "page_view",
          action: "page.view",
          path: "/board",
          userAgent: "Chrome · Windows",
          ipAddress: "127.0.0.1",
        }),
        select: { id: true },
      });
    });

    it("swallows errors and returns null when db fails", async () => {
      (prisma.userActivity.create as any).mockRejectedValueOnce(new Error("DB Down"));

      const res = await recordActivity({
        eventType: "action",
        action: "test.fail",
        path: "/test",
      });

      expect(res).toBeNull();
    });
  });
});
