import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getActivityMetrics, listUserActivities } from "@/lib/activity/service";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn((session) => session?.user?.role === "admin"),
}));

vi.mock("@/lib/activity/service", () => ({
  getActivityMetrics: vi.fn(),
  listUserActivities: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/admin/activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 if user is not admin", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: "user_normal", role: "member" },
    } as unknown as Awaited<ReturnType<typeof getSession>>);

    const req = new NextRequest("http://localhost:3000/api/admin/activity");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Forbidden");
  });

  it("returns metrics, activities, and user list for admin", async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: "user_admin", role: "admin" },
    } as unknown as Awaited<ReturnType<typeof getSession>>);

    const mockMetrics = {
      onlineCount: 3,
      activeUsersToday: 12,
      totalViewsToday: 150,
      totalActionsToday: 45,
    };
    vi.mocked(getActivityMetrics).mockResolvedValueOnce(mockMetrics);

    const mockActivities = {
      items: [
        {
          id: "act_1",
          userName: "Dev A",
          path: "/board",
          eventType: "page_view",
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    };
    vi.mocked(listUserActivities).mockResolvedValueOnce(mockActivities);

    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { id: "u1", displayName: "Dev A", email: "a@test.com", jiraUsername: "deva" },
    ] as unknown as Awaited<ReturnType<typeof prisma.user.findMany>>);

    const req = new NextRequest("http://localhost:3000/api/admin/activity?range=today&page=1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.metrics).toEqual(mockMetrics);
    expect(data.items).toHaveLength(1);
    expect(data.pagination.total).toBe(1);
    expect(data.users).toHaveLength(1);
  });
});
