import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getMembershipRefreshStatus: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/jira/board-membership-store", () => ({
  getMembershipRefreshStatus: mocks.getMembershipRefreshStatus,
}));

import { GET } from "./route";

describe("GET /api/board/membership/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getMembershipRefreshStatus.mockResolvedValue({
      state: "succeeded",
      lastStartedAt: new Date("2026-10-01T10:00:00Z"),
      lastSuccessAt: new Date("2026-10-01T10:01:00Z"),
      lastRequestedAt: new Date("2026-10-01T10:05:00Z"),
      lastErrorCode: null,
      itemCount: 42,
      lastJobId: "job-1",
      refreshReason: "preference_saved",
      stale: false,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/board/membership/status?project=EPM&boardId=101"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when project or boardId is missing/invalid", async () => {
    const res = await GET(new Request("http://localhost/api/board/membership/status?project=&boardId=101"));
    expect(res.status).toBe(400);
  });

  it("returns status object with 200 without queue side effects", async () => {
    const res = await GET(new Request("http://localhost/api/board/membership/status?project=EPM&boardId=101"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.state).toBe("succeeded");
    expect(data.itemCount).toBe(42);
    expect(mocks.getMembershipRefreshStatus).toHaveBeenCalledWith("user-1", "EPM", 101);
  });
});
