import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  findMany: vi.fn(),
  findUser: vi.fn(),
  listActiveProjects: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: { findMany: mocks.findMany },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/jira/project-catalog")>()),
  listActiveProjects: mocks.listActiveProjects,
}));

import { GET } from "./route";

describe("GET /api/sync/jira/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.findUser.mockResolvedValue({ boardProjects: [] });
    mocks.listActiveProjects.mockResolvedValue([{ key: "EPM" }, { key: "CRM" }]);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("only queries cursors of the user's board projects", async () => {
    mocks.findUser.mockResolvedValue({ boardProjects: ["epm", "ZZZ"] });
    mocks.findMany.mockResolvedValue([]);
    await GET();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { integration: "jira", scope: { in: ["EPM"] } } }),
    );
  });

  it("falls back to all active catalog projects when the user has no board projects", async () => {
    mocks.findMany.mockResolvedValue([]);
    await GET();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { integration: "jira", scope: { in: ["EPM", "CRM"] } } }),
    );
  });

  it("returns empty lists when no cursors exist", async () => {
    mocks.findMany.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncingProjects).toEqual([]);
    expect(body.activeSyncs).toEqual([]);
  });

  it("detects projects with active lease token and unexpired expiry", async () => {
    const future = new Date(Date.now() + 60_000);
    const started = new Date(Date.now() - 5_000);

    mocks.findMany.mockResolvedValue([
      {
        scope: "EPM",
        lastStartedAt: started,
        lastSuccessAt: new Date(Date.now() - 100_000),
        lastErrorAt: null,
        activeRunToken: "token-123",
        activeRunExpiresAt: future,
        activeRunStartedAt: started,
      },
      {
        scope: "CRM",
        lastStartedAt: new Date(Date.now() - 50_000),
        lastSuccessAt: new Date(Date.now() - 10_000),
        lastErrorAt: null,
        activeRunToken: null,
        activeRunExpiresAt: null,
        activeRunStartedAt: null,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncingProjects).toEqual(["EPM"]);
    expect(body.activeSyncs).toHaveLength(1);
    expect(body.activeSyncs[0].projectKey).toBe("EPM");
  });

  it("detects projects where sync started recently without error or success", async () => {
    const started = new Date(Date.now() - 10_000);

    mocks.findMany.mockResolvedValue([
      {
        scope: "PORTAL",
        lastStartedAt: started,
        lastSuccessAt: new Date(Date.now() - 100_000),
        lastErrorAt: null,
        activeRunToken: null,
        activeRunExpiresAt: null,
        activeRunStartedAt: null,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncingProjects).toEqual(["PORTAL"]);
  });

  it("ignores projects whose lease expired and did not start recently", async () => {
    const past = new Date(Date.now() - 60_000);
    const started = new Date(Date.now() - 15 * 60_000); // 15 mins ago

    mocks.findMany.mockResolvedValue([
      {
        scope: "OLD",
        lastStartedAt: started,
        lastSuccessAt: new Date(Date.now() - 20 * 60_000),
        lastErrorAt: null,
        activeRunToken: "old-token",
        activeRunExpiresAt: past,
        activeRunStartedAt: started,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.syncingProjects).toEqual([]);
    expect(body.activeSyncs).toEqual([]);
  });
});
