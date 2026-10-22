import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  isRealAdmin: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.getSession,
  isRealAdmin: mocks.isRealAdmin,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: mocks.userFindMany,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("GET /api/admin/impersonate/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 if user is not real admin", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "m1", role: "member" } });
    mocks.isRealAdmin.mockReturnValue(false);

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns list of users if user is real admin", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "a1", role: "admin" } });
    mocks.isRealAdmin.mockReturnValue(true);

    mocks.userFindMany.mockResolvedValue([
      {
        id: "u1",
        displayName: "An Nguyen",
        email: "an@corp.com",
        jiraUsername: "an.nguyen",
        role: "member",
        jiraVerifiedAt: new Date(),
      },
      {
        id: "u2",
        displayName: "Binh Tran",
        email: "binh@corp.com",
        jiraUsername: "binh.tran",
        role: "lead",
        jiraVerifiedAt: null,
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.users).toHaveLength(2);
    expect(body.users[0]).toEqual({
      id: "u1",
      displayName: "An Nguyen",
      email: "an@corp.com",
      jiraUsername: "an.nguyen",
      role: "member",
      hasJiraLinked: true,
    });
    expect(body.users[1].hasJiraLinked).toBe(false);
  });
});
