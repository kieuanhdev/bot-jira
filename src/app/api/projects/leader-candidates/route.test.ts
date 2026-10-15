import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canUserManageAnyProjectLeaders: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: () => mocks.getSession(),
}));

vi.mock("@/lib/projects/roles", () => ({
  canUserManageAnyProjectLeaders: (...args: unknown[]) =>
    mocks.canUserManageAnyProjectLeaders(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mocks.findMany(...args),
    },
  },
}));

import { GET } from "./route";

describe("GET /api/projects/leader-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when session is missing", async () => {
    mocks.getSession.mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ error: "unauthorized" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not authorized to manage any project leaders", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "user-1", role: "member" },
    });
    mocks.canUserManageAnyProjectLeaders.mockResolvedValueOnce(false);

    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toEqual({ error: "forbidden" });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with only id and displayName for authorized project leader", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "leader-1", role: "lead" },
    });
    mocks.canUserManageAnyProjectLeaders.mockResolvedValueOnce(true);
    mocks.findMany.mockResolvedValueOnce([
      { id: "u-1", displayName: "Alice" },
      { id: "u-2", displayName: "Bob" },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      users: [
        { id: "u-1", displayName: "Alice" },
        { id: "u-2", displayName: "Bob" },
      ],
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    });
  });

  it("returns 200 for admin user", async () => {
    mocks.getSession.mockResolvedValueOnce({
      user: { id: "admin-1", role: "admin" },
    });
    mocks.canUserManageAnyProjectLeaders.mockResolvedValueOnce(true);
    mocks.findMany.mockResolvedValueOnce([{ id: "u-1", displayName: "Alice" }]);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users).toHaveLength(1);
  });
});
