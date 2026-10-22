import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getMyWorkSummary: vi.fn(),
  getMyWorkTasks: vi.fn(),
  getMyWorkAnalytics: vi.fn(),
  getMyWorkTimeline: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/my-work/service", () => ({
  getMyWorkSummary: mocks.getMyWorkSummary,
  getMyWorkTasks: mocks.getMyWorkTasks,
  getMyWorkAnalytics: mocks.getMyWorkAnalytics,
  getMyWorkTimeline: mocks.getMyWorkTimeline,
}));

import { GET as getSummary } from "./summary/route";
import { GET as getTasks } from "./tasks/route";
import { GET as getAnalytics } from "./analytics/route";
import { GET as getTimeline } from "./timeline/route";

describe("my-work API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("summary returns 401 if unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await getSummary();
    expect(res.status).toBe(401);
  });

  it("summary returns data if authenticated", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1", jiraUsername: "dev1" } });
    mocks.getMyWorkSummary.mockResolvedValueOnce({ assignedCount: 5, onTimeRate: 95 });

    const res = await getSummary();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.assignedCount).toBe(5);
  });

  it("tasks passes filters correctly", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1", jiraUsername: "dev1" } });
    mocks.getMyWorkTasks.mockResolvedValueOnce({ items: [], pagination: { total: 0 } });

    const req = new NextRequest("http://localhost/api/my-work/tasks?role=awaiting_review&status=ACTIVE&page=2&limit=15");
    const res = await getTasks(req);
    expect(res.status).toBe(200);
    expect(mocks.getMyWorkTasks).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      {
        role: "awaiting_review",
        status: "ACTIVE",
        search: undefined,
        page: 2,
        limit: 15,
      }
    );
  });

  it("analytics parses weeks correctly", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1", jiraUsername: "dev1" } });
    mocks.getMyWorkAnalytics.mockResolvedValueOnce({ velocityByWeek: [] });

    const req = new NextRequest("http://localhost/api/my-work/analytics?weeks=12");
    const res = await getAnalytics(req);
    expect(res.status).toBe(200);
    expect(mocks.getMyWorkAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      12
    );
  });

  it("timeline parses days correctly", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1", jiraUsername: "dev1" } });
    mocks.getMyWorkTimeline.mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/my-work/timeline?days=7");
    const res = await getTimeline(req);
    expect(res.status).toBe(200);
    expect(mocks.getMyWorkTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u1" }),
      7
    );
  });
});
