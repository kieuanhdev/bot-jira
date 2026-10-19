import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  sentryScopeFor: vi.fn(),
  listSentryImports: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
}));

vi.mock("@/lib/sentry/list", () => ({
  listSentryImports: mocks.listSentryImports,
}));

import { GET } from "./route";

describe("GET /api/sentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost/api/sentry"));
    expect(res.status).toBe(401);
  });

  it("calls listSentryImports with resolved scope and search parameters", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u-1", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValueOnce({ all: false, projects: ["EPM"] });
    mocks.listSentryImports.mockResolvedValueOnce({
      counts: { review: 5 },
      requireApproval: true,
      items: [],
    });

    const res = await GET(new Request("http://localhost/api/sentry?state=review&project=EPM"));
    expect(res.status).toBe(200);
    expect(mocks.sentryScopeFor).toHaveBeenCalledWith({ user: { id: "u-1", role: "member" } });
    expect(mocks.listSentryImports).toHaveBeenCalledWith("review", { all: false, projects: ["EPM"] }, "EPM");
  });
});
