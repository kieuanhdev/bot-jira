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

  it("allows member to trigger sync", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u2", role: "member" } });
    const res = await POST(new Request("http://localhost/api/releases/sync?projectKey=EPM", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(syncReleasesFromJiraMock).toHaveBeenCalledWith({
      userId: "u2",
      projectKeys: ["EPM"],
    });
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

  it("returns 428 when sync result indicates auth_required", async () => {
    syncReleasesFromJiraMock.mockResolvedValue({
      syncedProjects: [],
      totalReleases: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errors: ["Chưa cấu hình tài khoản Jira hợp lệ"],
      projects: [
        {
          projectKey: "EIM",
          state: "auth_required",
          errorCode: "jira_credentials_required",
          errorMessage: "Chưa cấu hình tài khoản Jira hợp lệ",
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
        },
      ],
    });

    const res = await POST(new Request("http://localhost/api/releases/sync?projectKey=EIM", { method: "POST" }));
    expect(res.status).toBe(428);
    const json = await res.json();
    expect(json.code).toBe("jira_credentials_required");
  });

  it("returns 403 when sync result indicates forbidden", async () => {
    syncReleasesFromJiraMock.mockResolvedValue({
      syncedProjects: [],
      totalReleases: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errors: ["Forbidden"],
      projects: [
        {
          projectKey: "EIM",
          state: "forbidden",
          errorCode: "jira_forbidden",
          errorMessage: "Không có quyền xem version",
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
        },
      ],
    });

    const res = await POST(new Request("http://localhost/api/releases/sync?projectKey=EIM", { method: "POST" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("jira_forbidden");
  });

  it("returns 200 with success when sync confirms project is empty", async () => {
    syncReleasesFromJiraMock.mockResolvedValue({
      syncedProjects: ["EIM"],
      totalReleases: 0,
      created: 0,
      updated: 0,
      tasksLinked: 0,
      errors: [],
      projects: [
        {
          projectKey: "EIM",
          state: "empty",
          errorCode: null,
          errorMessage: null,
          versionCount: 0,
          created: 0,
          updated: 0,
          tasksLinked: 0,
        },
      ],
    });

    const res = await POST(new Request("http://localhost/api/releases/sync?projectKey=EIM", { method: "POST" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.result.projects[0].state).toBe("empty");
  });
});
