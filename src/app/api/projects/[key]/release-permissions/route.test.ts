import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const { prismaMock, sessionMock, canMock, userJiraAuthMock, getMyPermissionsMock, jiraWithMock } = vi.hoisted(() => {
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const userJiraAuthMock = vi.fn();
  const getMyPermissionsMock = vi.fn();
  const jiraWithMock = vi.fn(() => ({
    getMyPermissions: getMyPermissionsMock,
  }));
  const prismaMock = {
    user: {
      findUnique: vi.fn(),
    },
  };
  return { prismaMock, sessionMock, canMock, userJiraAuthMock, getMyPermissionsMock, jiraWithMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/jira/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/client")>();
  return {
    ...actual,
    jiraWith: jiraWithMock,
  };
});

import { JiraRequestError } from "@/lib/jira/client";

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({
    user: { id: "u1", email: "manager@example.com", role: "release_manager" },
  });
  canMock.mockReturnValue(true);
  prismaMock.user.findUnique.mockResolvedValue({
    jiraUserEnc: "enc-user",
    jiraTokenEnc: "enc-tok",
    jiraAuth: "Bearer",
  });
  userJiraAuthMock.mockReturnValue({
    user: "manager",
    token: "personal-token",
    authMode: "Bearer",
  });
  getMyPermissionsMock.mockResolvedValue({
    permissions: {
      ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: true },
    },
  });
});

describe("GET /api/projects/[key]/release-permissions", () => {
  it("returns 401 when unauthenticated", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("unauthorized");
  });

  it("allows member to check permissions based on Jira token", async () => {
    sessionMock.mockResolvedValue({
      user: { id: "u2", email: "member@example.com", role: "member" },
    });
    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.canCreateVersion).toBe(true);
    expect(getMyPermissionsMock).toHaveBeenCalledWith("EPM");
  });

  it("returns 400 when project key is invalid or 'all'", async () => {
    const res1 = await GET(new Request("http://localhost/api/projects/all/release-permissions"), ctx("all"));
    expect(res1.status).toBe(400);
    expect((await res1.json()).code).toBe("invalid_project_key");

    const res2 = await GET(new Request("http://localhost/api/projects/%20/release-permissions"), ctx("   "));
    expect(res2.status).toBe(400);
    expect((await res2.json()).code).toBe("invalid_project_key");
  });

  it("returns 428 when user has no configured personal Jira token", async () => {
    userJiraAuthMock.mockReturnValue(null);
    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(428);
    const json = await res.json();
    expect(json.code).toBe("jira_credentials_required");
    expect(getMyPermissionsMock).not.toHaveBeenCalled();
  });

  it("returns 200 with canCreateVersion: true when token has project admin permission", async () => {
    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      projectKey: "EPM",
      hasToken: true,
      canCreateVersion: true,
    });
    expect(getMyPermissionsMock).toHaveBeenCalledWith("EPM");
  });

  it("returns 200 with canCreateVersion: false and reason when lacking permission", async () => {
    getMyPermissionsMock.mockResolvedValue({
      permissions: {
        ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: false },
      },
    });

    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      projectKey: "EPM",
      hasToken: true,
      canCreateVersion: false,
      reason: "jira_permission_required",
    });
    expect(json).not.toHaveProperty("token");
    expect(json).not.toHaveProperty("permissions");
  });

  it("returns 502 with jira_auth_failed when Jira returns 401 or 403", async () => {
    getMyPermissionsMock.mockRejectedValue(new JiraRequestError("Unauthorized", 401, false));
    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("jira_auth_failed");
  });

  it("returns 502 with jira_unavailable on Jira timeout or 5xx", async () => {
    getMyPermissionsMock.mockRejectedValue(new JiraRequestError("Jira timeout", null, true));
    const res = await GET(new Request("http://localhost/api/projects/EPM/release-permissions"), ctx("EPM"));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("jira_unavailable");
  });
});
