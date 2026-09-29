import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/env", () => ({
  isKnownProject: (key: string) => ["EPM", "MR", "CICM"].includes(key),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: { findUnique: mocks.findUnique },
  },
}));

import { GET } from "./route";

describe("GET /api/sync/jira/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/sync/jira/status?projectKey=EPM"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectKey is missing or invalid", async () => {
    const res1 = await GET(new Request("http://localhost/api/sync/jira/status"));
    expect(res1.status).toBe(400);

    const res2 = await GET(new Request("http://localhost/api/sync/jira/status?projectKey=bad_format!"));
    expect(res2.status).toBe(400);
  });

  it("returns unknown when no cursor exists for project", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/sync/jira/status?projectKey=EPM"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("unknown");
    expect(body.projectKey).toBe("EPM");
  });

  it("derives queued when timestamps are before the since threshold", async () => {
    const since = new Date(Date.now() - 5000).toISOString();
    mocks.findUnique.mockResolvedValue({
      lastStartedAt: new Date(Date.now() - 30_000),
      lastSuccessAt: new Date(Date.now() - 30_000),
      lastErrorAt: null,
      lastError: null,
    });

    const res = await GET(new Request(`http://localhost/api/sync/jira/status?projectKey=EPM&since=${since}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("queued");
  });

  it("derives running when job started after since and hasn't finished", async () => {
    const since = new Date(Date.now() - 10_000).toISOString();
    mocks.findUnique.mockResolvedValue({
      lastStartedAt: new Date(Date.now() - 5000),
      lastSuccessAt: new Date(Date.now() - 30_000),
      lastErrorAt: null,
      lastError: null,
    });

    const res = await GET(new Request(`http://localhost/api/sync/jira/status?projectKey=EPM&since=${since}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("running");
  });

  it("derives succeeded when lastSuccessAt is after since and after started", async () => {
    const since = new Date(Date.now() - 10_000).toISOString();
    mocks.findUnique.mockResolvedValue({
      lastStartedAt: new Date(Date.now() - 8000),
      lastSuccessAt: new Date(Date.now() - 2000),
      lastErrorAt: null,
      lastError: null,
    });

    const res = await GET(new Request(`http://localhost/api/sync/jira/status?projectKey=EPM&since=${since}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("succeeded");
  });

  it("derives failed and sanitizes error message", async () => {
    const since = new Date(Date.now() - 10_000).toISOString();
    mocks.findUnique.mockResolvedValue({
      lastStartedAt: new Date(Date.now() - 8000),
      lastSuccessAt: new Date(Date.now() - 30_000),
      lastErrorAt: new Date(Date.now() - 2000),
      lastError: "Jira API error with bearer secret_token_12345: timeout",
    });

    const res = await GET(new Request(`http://localhost/api/sync/jira/status?projectKey=EPM&since=${since}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("failed");
    expect(body.lastError).not.toContain("secret_token_12345");
    expect(body.lastError).toContain("bearer=***");
  });
});
