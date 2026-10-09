import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  systemAuth: vi.fn(),
  userAuth: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userAuth }));
vi.mock("@/lib/jira/client", () => ({ getSystemJiraAuth: mocks.systemAuth }));
vi.mock("@/lib/env", () => ({ env: { jiraBaseUrl: "https://jira.example.test" } }));

import { GET } from "./route";

describe("GET /api/jira/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(null);
    mocks.systemAuth.mockResolvedValue(null);
    mocks.userAuth.mockReturnValue(null);
  });

  it("returns 400 when neither username nor url is provided", async () => {
    const response = await GET(new Request("http://localhost/api/jira/avatar"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Missing username or url parameter",
    });
  });

  it("returns 401 when Jira authentication is unavailable", async () => {
    const response = await GET(
      new Request("http://localhost/api/jira/avatar?url=https://cdn.example.test/avatar.png")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Jira authentication unavailable",
    });
  });

  it("proxies an image with the existing cache and content headers", async () => {
    mocks.systemAuth.mockResolvedValue({
      user: "service",
      token: "secret",
      authMode: "Bearer",
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png; charset=binary" },
      })
    );

    const response = await GET(
      new Request("http://localhost/api/jira/avatar?url=https://cdn.example.test/avatar.png")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400"
    );
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{32}"$/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
