import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  assertAccess: vi.fn(),
  sentryScopeFor: vi.fn(),
  hasOpenAi: vi.fn(),
  creds: vi.fn(),
  latest: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
  assertSentryRowAccess: mocks.assertAccess,
}));

vi.mock("@/lib/env", () => ({ hasOpenAiConfig: mocks.hasOpenAi }));
vi.mock("@/lib/sentry/creds-for-project", () => ({ sentryCredsForProject: mocks.creds }));
vi.mock("@/lib/sentry/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sentry/client")>("@/lib/sentry/client");
  return { ...actual, getLatestEvent: mocks.latest };
});
vi.mock("@/lib/ai/generate-json", () => ({ generateJson: mocks.generate }));

import { POST } from "./route";

const call = () =>
  POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "row-1" }) });

const dbRow = {
  id: "row-1",
  sentryProject: "web",
  sentryIssueId: "4242",
  shortId: "WEB-1A",
  title: "TypeError",
  permalinkUrl: "https://sentry.example.com/issues/4242/",
  level: "error",
  eventCount: 3,
  firstSeen: new Date("2026-10-01T00:00:00Z"),
  lastSeen: new Date("2026-10-16T00:00:00Z"),
};

describe("POST /api/sentry/[id]/ai-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValue({ all: false, projects: ["EPM"] });
    mocks.hasOpenAi.mockReturnValue(true);
    mocks.assertAccess.mockResolvedValue(dbRow);
    mocks.creds.mockResolvedValue({ org: "acme", project: "web", token: "t" });
    mocks.latest.mockResolvedValue({
      eventID: "e1",
      culprit: "checkout in submitOrder",
      entries: [],
    });
    mocks.generate.mockImplementation(async (prompt: string, parse: (o: unknown) => unknown) =>
      parse({ summary: "Summary", description: "Description" })
    );
  });

  it("returns 401 when not logged in", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("returns 503 when AI is not configured", async () => {
    mocks.hasOpenAi.mockReturnValueOnce(false);
    const res = await call();
    expect(res.status).toBe(503);
  });

  it("returns 404 when row is outside user scope", async () => {
    mocks.assertAccess.mockRejectedValueOnce(new Error("forbidden"));
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("returns generated summary for authenticated user in scope", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toContain("Summary");
    expect(body.description).toContain("Description");
    expect(body.usedEvent).toBe(true);
  });
});
