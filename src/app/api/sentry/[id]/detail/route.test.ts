import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  assertAccess: vi.fn(),
  sentryScopeFor: vi.fn(),
  creds: vi.fn(),
  latest: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/sentry/scope", () => ({
  sentryScopeFor: mocks.sentryScopeFor,
  assertSentryRowAccess: mocks.assertAccess,
}));
vi.mock("@/lib/sentry/creds-for-project", () => ({ sentryCredsForProject: mocks.creds }));
vi.mock("@/lib/sentry/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sentry/client")>("@/lib/sentry/client");
  return { ...actual, getLatestEvent: mocks.latest };
});

import { GET } from "./route";

const call = () => GET(new Request("http://localhost"), { params: Promise.resolve({ id: "row-1" }) });
const dbRow = { id: "row-1", sentryProject: "web", sentryIssueId: "4242" };

describe("GET /api/sentry/[id]/detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "member" } });
    mocks.sentryScopeFor.mockResolvedValue({ all: false, projects: ["EPM"] });
    mocks.assertAccess.mockResolvedValue(dbRow);
    mocks.creds.mockResolvedValue({ org: "acme", project: "web", token: "t" });
  });

  it("401 without a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it("404 when the row is outside the user's scope", async () => {
    mocks.assertAccess.mockRejectedValue(new Error("forbidden"));
    expect((await call()).status).toBe(404);
    expect(mocks.latest).not.toHaveBeenCalled();
  });

  it("returns the scrubbed digest with tags", async () => {
    mocks.latest.mockResolvedValue({
      eventID: "e1",
      culprit: "checkout in submitOrder",
      tags: [
        { key: "release", value: "app@2.3.1" },
        { key: "environment", value: "production" },
        { key: "user", value: "someone@example.com" },
      ],
      entries: [],
    });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reason).toBe("ok");
    expect(body.digest.culprit).toBe("checkout in submitOrder");
    expect(body.digest.tags).toEqual({ release: "app@2.3.1", environment: "production" });
  });

  it("reports no_token when no stored token can read the project", async () => {
    mocks.creds.mockResolvedValue(null);
    const body = await (await call()).json();
    expect(body).toEqual({ digest: null, reason: "no_token" });
    expect(mocks.latest).not.toHaveBeenCalled();
  });

  it("reports error (not a 500) when Sentry fails", async () => {
    mocks.latest.mockRejectedValue(new Error("Sentry -> 500"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ digest: null, reason: "error" });
  });
});
