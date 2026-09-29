import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const { sessionMock, canMock, syncReleasesFromJiraMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const syncReleasesFromJiraMock = vi.fn();
  return { sessionMock, canMock, syncReleasesFromJiraMock };
});

vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("audit-id") }));
vi.mock("@/lib/releases/sync", () => ({ syncReleasesFromJira: syncReleasesFromJiraMock }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", role: "release_manager" } });
  canMock.mockReturnValue(true);
  syncReleasesFromJiraMock.mockResolvedValue({
    syncedProjects: ["EPM"],
    totalReleases: 3,
    created: 1,
    updated: 2,
    tasksLinked: 10,
    errors: [],
  });
});

describe("POST /api/releases/sync", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/releases/sync", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks release.manage permission", async () => {
    canMock.mockReturnValue(false);
    const res = await POST(new Request("http://localhost/api/releases/sync", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("calls sync and returns success for release manager", async () => {
    const res = await POST(new Request("http://localhost/api/releases/sync?projectKey=EPM", { method: "POST" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(syncReleasesFromJiraMock).toHaveBeenCalledWith({
      userId: "u1",
      projectKeys: ["EPM"],
    });
  });
});
