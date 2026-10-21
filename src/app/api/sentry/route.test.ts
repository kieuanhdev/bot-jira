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
    expect(mocks.listSentryImports).toHaveBeenCalledWith(
      "review",
      { all: false, projects: ["EPM"] },
      "EPM",
      { q: undefined, sort: undefined }
    );
  });

  it("passes validated q and sort to listSentryImports", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u-1", role: "admin" } });
    mocks.sentryScopeFor.mockResolvedValueOnce({ all: true });
    mocks.listSentryImports.mockResolvedValueOnce({ counts: {}, requireApproval: true, items: [] });

    const res = await GET(
      new Request("http://localhost/api/sentry?state=review&q=%20NullPointer%20&sort=events")
    );
    expect(res.status).toBe(200);
    expect(mocks.listSentryImports).toHaveBeenCalledWith(
      "review",
      { all: true },
      undefined,
      { q: "NullPointer", sort: "events" }
    );
  });

  it("ignores invalid sort and overlong q", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u-1", role: "admin" } });
    mocks.sentryScopeFor.mockResolvedValueOnce({ all: true });
    mocks.listSentryImports.mockResolvedValueOnce({ counts: {}, requireApproval: true, items: [] });

    const longQ = "a".repeat(105);
    const res = await GET(
      new Request(`http://localhost/api/sentry?q=${longQ}&sort=malicious_sort`)
    );
    expect(res.status).toBe(200);
    expect(mocks.listSentryImports).toHaveBeenCalledWith(
      undefined,
      { all: true },
      undefined,
      { q: undefined, sort: undefined }
    );
  });
});
