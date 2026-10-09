import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getLeaderboardData: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/leaderboard/service", () => ({
  getLeaderboardData: mocks.getLeaderboardData,
}));

import { GET } from "./route";

describe("GET /api/leaderboard route characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 when user is not authenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new Request("http://localhost/api/leaderboard");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "unauthorized" });
  });

  it("passes parsed parameters to service and returns 200 with leaderboard data", async () => {
    const mockData = {
      timeframe: "quarter",
      periodLabel: "Quý 3/2026",
      year: 2026,
      month: null,
      quarter: 3,
      project: "PROJ",
      projects: ["PROJ"],
      members: [],
      summary: {
        totalTeamPoints: 0,
        totalTeamTasks: 0,
        activeMembersCount: 0,
        averagePointsPerMember: 0,
        topPerformer: null,
      },
      myPerformance: null,
    };

    mocks.getLeaderboardData.mockResolvedValue(mockData);

    const req = new Request(
      "http://localhost/api/leaderboard?timeframe=quarter&year=2026&quarter=3&project=proj"
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockData);

    expect(mocks.getLeaderboardData).toHaveBeenCalledWith({
      currentUserId: "user-1",
      timeframe: "quarter",
      year: 2026,
      month: undefined,
      quarter: 3,
      project: "PROJ",
    });
  });

  it("returns 500 error when service throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getLeaderboardData.mockRejectedValue(new Error("Database connection failure"));

    const req = new Request("http://localhost/api/leaderboard");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: "failed_to_fetch_leaderboard",
      details: "Database connection failure",
    });

    consoleSpy.mockRestore();
  });
});
