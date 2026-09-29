import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "./route";

const { prismaMock, sessionMock, canMock, userJiraAuthMock, jiraWithMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const userJiraAuthMock = vi.fn();
  const createVersionMock = vi.fn();
  const getVersionsMock = vi.fn();
  const jiraWithMock = vi.fn(() => ({
    createVersion: createVersionMock,
    getVersions: getVersionsMock,
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
  return { prismaMock, sessionMock, canMock, userJiraAuthMock, jiraWithMock, createVersionMock, getVersionsMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("audit-id") }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/jira/client", () => ({ jiraWith: jiraWithMock, JiraRequestError: class extends Error {} }));
vi.mock("@/lib/releases/sync", () => ({ syncReleasesFromJira: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", email: "mgr@team.io", role: "release_manager" } });
  canMock.mockReturnValue(true);
  userJiraAuthMock.mockReturnValue({ user: "mgr", token: "tok", authMode: "Bearer" });
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.branchInfo.findMany.mockResolvedValue([]);
  prismaMock.issueCache.findMany.mockResolvedValue([]);
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

  it("returns 403 when user lacks release.manage permission", async () => {
    canMock.mockReturnValue(false);
    const res = await POST(new Request("http://localhost/api/releases", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM", version: "v1.0" }),
    }));
    expect(res.status).toBe(403);
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
  });
});
