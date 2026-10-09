import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const { prismaMock, sessionMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const prismaMock = {
    release: {
      findUnique: vi.fn(),
    },
    releaseCheck: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { prismaMock, sessionMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));

const ctx = (id = "r1") => ({
  params: Promise.resolve({ id }),
});

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1" } });
  prismaMock.release.findUnique.mockResolvedValue({ id: "r1" });
});

describe("GET /api/releases/:id/checks", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/releases/r1/checks"), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when release not found", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/releases/r1/checks"), ctx());
    expect(res.status).toBe(404);
  });

  it("returns paginated checks with gates", async () => {
    prismaMock.releaseCheck.count.mockResolvedValue(25);
    prismaMock.releaseCheck.findMany.mockResolvedValue([
      {
        id: "chk-1",
        triggeredBy: "user@test.io",
        status: "ready",
        summary: "Release is ready",
        blockers: [],
        sourceTimes: {},
        createdAt: new Date("2026-10-09T02:00:00Z"),
        gates: [
          {
            id: "g-1",
            gate: "task_status",
            state: "passed",
            summary: "All done",
            details: null,
            sourceTime: null,
            createdAt: new Date("2026-10-09T02:00:00Z"),
          },
        ],
      },
    ]);

    const res = await GET(new Request("http://x/api/releases/r1/checks?limit=15&offset=5"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releaseId).toBe("r1");
    expect(body.total).toBe(25);
    expect(body.limit).toBe(15);
    expect(body.offset).toBe(5);
    expect(body.checks).toHaveLength(1);
    expect(body.checks[0].gates).toHaveLength(1);

    expect(prismaMock.releaseCheck.findMany).toHaveBeenCalledWith({
      where: { releaseId: "r1" },
      include: { gates: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 15,
      skip: 5,
    });
  });

  it("clamps limit between 1 and 100", async () => {
    prismaMock.releaseCheck.count.mockResolvedValue(0);
    prismaMock.releaseCheck.findMany.mockResolvedValue([]);

    const res1 = await GET(new Request("http://x/api/releases/r1/checks?limit=500"), ctx());
    const body1 = await res1.json();
    expect(body1.limit).toBe(100);

    const res2 = await GET(new Request("http://x/api/releases/r1/checks?limit=-5"), ctx());
    const body2 = await res2.json();
    expect(body2.limit).toBe(1);
  });
});
