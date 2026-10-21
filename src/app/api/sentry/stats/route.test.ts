import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  sentryScopeFor: vi.fn(),
  getSentryStats: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
}));

vi.mock("@/lib/sentry/stats", () => ({
  getSentryStats: mocks.getSentryStats,
}));

import { GET } from "./route";

describe("GET /api/sentry/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost/api/sentry/stats"));
    expect(res.status).toBe(401);
  });

  it("calls getSentryStats with resolved scope and project parameter", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u-1", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValueOnce({ all: false, projects: ["EPM"] });
    mocks.getSentryStats.mockResolvedValueOnce({
      pendingReview: 10,
      criticalPending: 2,
      new24h: 3,
      noiseRatio: 0.1,
      byDay: [],
    });

    const res = await GET(new Request("http://localhost/api/sentry/stats?project=EPM"));
    expect(res.status).toBe(200);
    expect(mocks.sentryScopeFor).toHaveBeenCalledWith({ user: { id: "u-1", role: "member" } });
    expect(mocks.getSentryStats).toHaveBeenCalledWith(
      { all: false, projects: ["EPM"] },
      "EPM"
    );
    const body = await res.json();
    expect(body.pendingReview).toBe(10);
  });
});
