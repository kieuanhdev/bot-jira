import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

const { prismaMock, sessionMock, canMock, userJiraAuthMock, jiraWithMock, createVersionMock, getVersionsMock, getMyPermissionsMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const userJiraAuthMock = vi.fn();
  const createVersionMock = vi.fn();
  const getVersionsMock = vi.fn();
  const getMyPermissionsMock = vi.fn();
  const jiraWithMock = vi.fn(() => ({
    createVersion: createVersionMock,
    getVersions: getVersionsMock,
    getMyPermissions: getMyPermissionsMock,
  }));
  const prismaMock = {
    release: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    branchInfo: {
      findMany: vi.fn(),
    },
    issueCache: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    releaseTask: {
      createMany: vi.fn(),
    },
  };
  return { prismaMock, sessionMock, canMock, userJiraAuthMock, jiraWithMock, createVersionMock, getVersionsMock, getMyPermissionsMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("audit-id") }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/jira/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/client")>();
  return {
    ...actual,
    jiraWith: jiraWithMock,
  };
});
vi.mock("@/lib/releases/sync", () => ({ syncReleasesFromJira: vi.fn() }));

import { JiraRequestError } from "@/lib/jira/client";

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", email: "mgr@team.io", role: "release_manager" } });
  canMock.mockReturnValue(true);
  userJiraAuthMock.mockReturnValue({ user: "mgr", token: "tok", authMode: "Bearer" });
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.branchInfo.findMany.mockResolvedValue([]);
  prismaMock.issueCache.findMany.mockResolvedValue([]);
  getMyPermissionsMock.mockResolvedValue({
    permissions: {
      ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: true },
    },
  });
});

describe("GET /api/releases", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/releases"));
    expect(res.status).toBe(401);
  });

  it("returns releases list with summary and items", async () => {
    prismaMock.release.findMany.mockResolvedValue([
      {
        id: "r1",
        version: "v1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
        archived: false,
        lastSyncedAt: new Date(),
        tasks: [
          {
            jiraKey: "EPM-1",
            issue: {
              jiraKey: "EPM-1",
              status: "Done",
              statusCategory: "done",
              summary: "Task 1",
              labels: ["no-code"],
              deletedAt: null,
            },
          },
        ],
      },
      {
        id: "r2",
        version: "v2.0",
        projectKey: "EPM",
        jiraVersionId: "v2",
        status: "draft",
        archived: false,
        lastSyncedAt: new Date(),
        tasks: [],
      },
    ]);

    const res = await GET(new Request("http://localhost/api/releases?projectKey=EPM"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary).toBeDefined();
    expect(data.summary.totalActive).toBe(2);
    expect(data.summary.ready).toBe(1);
    expect(data.summary.empty).toBe(1);
    expect(data.summary.totalActive).toBe(
      data.summary.inProgress + data.summary.ready + data.summary.empty + data.summary.released
    );
    expect(data.items).toHaveLength(2);
  });
});

describe("POST /api/releases", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0" }),
    }));
    expect(res.status).toBe(401);
  });

  it("allows member with valid Jira permissions to create release", async () => {
    sessionMock.mockResolvedValue({ user: { id: "u2", email: "member@team.io", role: "member" } });
    createVersionMock.mockResolvedValue({ id: "v101", name: "v1.1", released: false });
    prismaMock.release.findFirst.mockResolvedValue(null);
    prismaMock.release.create.mockResolvedValue({
      id: "r101",
      version: "v1.1",
      projectKey: "EPM",
      jiraVersionId: "v101",
      status: "draft",
    });

    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.1" }),
    }));
    expect(res.status).toBe(200);
    expect(createVersionMock).toHaveBeenCalledWith("EPM", "v1.1", undefined);
  });

  it("returns 400 when version is missing", async () => {
    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "   " }),
    }));
    expect(res.status).toBe(400);
  });

  it("returns 428 when user has no Jira personal token", async () => {
    userJiraAuthMock.mockReturnValue(null);
    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0" }),
    }));
    expect(res.status).toBe(428);
    const json = await res.json();
    expect(json.code).toBe("jira_credentials_required");
  });

  it("returns 403 jira_project_permission_required and does not call createVersion when user lacks Jira permission on project", async () => {
    getMyPermissionsMock.mockResolvedValue({
      permissions: {
        ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: false },
      },
    });

    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0" }),
    }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("jira_project_permission_required");
    expect(createVersionMock).not.toHaveBeenCalled();
    expect(prismaMock.release.create).not.toHaveBeenCalled();
  });

  it("calls getMyPermissions and createVersion, then creates release in DB when permission check passes", async () => {
    createVersionMock.mockResolvedValue({ id: "v100", name: "v1.0", released: false });
    prismaMock.release.findFirst.mockResolvedValue(null);
    prismaMock.release.create.mockResolvedValue({
      id: "r100",
      version: "v1.0",
      projectKey: "EPM",
      jiraVersionId: "v100",
      status: "draft",
    });

    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0", description: "First release" }),
    }));
    expect(res.status).toBe(200);
    expect(getMyPermissionsMock).toHaveBeenCalledWith("EPM");
    expect(createVersionMock).toHaveBeenCalledWith("EPM", "v1.0", "First release");
    expect(prismaMock.release.create).toHaveBeenCalled();
  });

  it("returns 403 jira_project_permission_required when Jira createVersion throws 403", async () => {
    createVersionMock.mockRejectedValue(new JiraRequestError("Forbidden on create", 403, false));

    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0" }),
    }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.code).toBe("jira_project_permission_required");
    expect(prismaMock.release.create).not.toHaveBeenCalled();
  });

  it("returns 502 jira_auth_failed when Jira throws 401 during permission check", async () => {
    getMyPermissionsMock.mockRejectedValue(new JiraRequestError("Unauthorized", 401, false));

    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0" }),
    }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("jira_auth_failed");
    expect(createVersionMock).not.toHaveBeenCalled();
  });
});
