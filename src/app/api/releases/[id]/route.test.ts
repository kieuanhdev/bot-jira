import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";

const { prismaMock, sessionMock, canMock, getReleaseReadinessMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const getReleaseReadinessMock = vi.fn();
  const prismaMock = {
    release: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prismaMock, sessionMock, canMock, getReleaseReadinessMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("audit-id") }));
vi.mock("@/lib/releases/release-readiness", () => ({
  getReleaseReadiness: getReleaseReadinessMock,
}));

const ctx = () => ({ params: Promise.resolve({ id: "r1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", role: "release_manager" } });
  canMock.mockReturnValue(true);
  getReleaseReadinessMock.mockResolvedValue({
    state: "ready",
    taskCount: 2,
    doneCount: 2,
    gitCompleteCount: 2,
    deliveryReadyCount: 2,
    blockers: [],
    tasks: [],
    jiraDataFresh: true,
    gitDataFresh: true,
    lastJiraSyncedAt: null,
    lastGitSyncedAt: null,
  });
});

describe("GET /api/releases/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/releases/r1"), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 404 when release not found", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/releases/r1"), ctx());
    expect(res.status).toBe(404);
  });

  it("returns release details with readiness", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1",
      version: "v1.0",
      projectKey: "EPM",
      status: "draft",
      archived: false,
    });
    const res = await GET(new Request("http://localhost/api/releases/r1"), ctx());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.item).toBeDefined();
    expect(data.item.readiness).toBe("ready");
    expect(data.item.taskCount).toBe(2);
  });
});

describe("PATCH /api/releases/:id", () => {
  it("returns 403 when user lacks release.manage permission", async () => {
    canMock.mockReturnValue(false);
    const res = await PATCH(new Request("http://localhost/api/releases/r1", {
      method: "PATCH",
      body: JSON.stringify({ notes: "new note" }),
    }), ctx());
    expect(res.status).toBe(403);
  });

  it("updates release notes and returns 200", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1",
      notes: "old note",
    });
    prismaMock.release.update.mockResolvedValue({
      id: "r1",
      notes: "new note",
    });

    const res = await PATCH(new Request("http://localhost/api/releases/r1", {
      method: "PATCH",
      body: JSON.stringify({ notes: "new note" }),
    }), ctx());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.item.notes).toBe("new note");
  });
});
