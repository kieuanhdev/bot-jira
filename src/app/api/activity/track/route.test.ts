import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { recordActivity } from "@/lib/activity/service";
import { getSession } from "@/lib/session";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/activity/service", () => ({
  recordActivity: vi.fn(),
}));

describe("POST /api/activity/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts session and request data and records activity", async () => {
    (getSession as any).mockResolvedValueOnce({
      user: { id: "user_1", name: "Nguyễn Văn A", email: "a@example.com" },
    });
    (recordActivity as any).mockResolvedValueOnce("act_1");

    const req = new NextRequest("http://localhost:3000/api/activity/track", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "x-forwarded-for": "192.168.1.100, 10.0.0.1",
      },
      body: JSON.stringify({
        path: "/board?project=PAY",
        eventType: "page_view",
        action: "page.view",
        description: "Xem bảng Kanban",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(recordActivity).toHaveBeenCalledWith({
      userId: "user_1",
      userName: "Nguyễn Văn A",
      userEmail: "a@example.com",
      eventType: "page_view",
      action: "page.view",
      description: "Xem bảng Kanban",
      path: "/board?project=PAY",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
      ipAddress: "192.168.1.100",
      metadata: undefined,
    });
  });

  it("handles unauthenticated requests gracefully", async () => {
    (getSession as any).mockResolvedValueOnce(null);
    (recordActivity as any).mockResolvedValueOnce("act_2");

    const req = new NextRequest("http://localhost:3000/api/activity/track", {
      method: "POST",
      body: JSON.stringify({
        path: "/login",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true });
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        userName: null,
        userEmail: null,
        path: "/login",
      })
    );
  });
});
