import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    jiraUser: "system",
    jiraToken: "sys-token",
    jiraAuth: "Bearer",
    jiraPointsFieldId: "",
    jiraRequestTimeoutMs: 5000,
  },
}));

import { jiraWith, canCreateProjectVersion, JiraRequestError } from "./client";
import type { JiraAuth } from "./client";
import type { JiraMyPermissions } from "./types";

const auth: JiraAuth = { user: "alice", token: "user-token", authMode: "Bearer" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Jira permissions & canCreateProjectVersion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("canCreateProjectVersion helper", () => {
    it("returns true when ADMINISTER_PROJECTS.havePermission is true", () => {
      const res: JiraMyPermissions = {
        permissions: {
          ADMINISTER_PROJECTS: {
            id: "23",
            name: "Administer Projects",
            havePermission: true,
          },
        },
      };
      expect(canCreateProjectVersion(res)).toBe(true);
    });

    it("returns true when MANAGE_VERSIONS or PROJECT_ADMIN is true", () => {
      const resManage: JiraMyPermissions = {
        permissions: {
          MANAGE_VERSIONS: { id: "100", name: "Manage Versions", havePermission: true },
        },
      };
      expect(canCreateProjectVersion(resManage)).toBe(true);

      const resProjAdmin: JiraMyPermissions = {
        permissions: {
          PROJECT_ADMIN: { id: "101", name: "Project Admin", havePermission: true },
        },
      };
      expect(canCreateProjectVersion(resProjAdmin)).toBe(true);
    });

    it("returns true when global ADMINISTER or SYSTEM_ADMIN is true", () => {
      const resAdmin: JiraMyPermissions = {
        permissions: {
          ADMINISTER: { id: "0", name: "Jira Administrators", havePermission: true },
        },
      };
      expect(canCreateProjectVersion(resAdmin)).toBe(true);

      const resSysAdmin: JiraMyPermissions = {
        permissions: {
          SYSTEM_ADMIN: { id: "44", name: "System Administrators", havePermission: true },
        },
      };
      expect(canCreateProjectVersion(resSysAdmin)).toBe(true);
    });

    it("returns false when havePermission is false", () => {
      const res: JiraMyPermissions = {
        permissions: {
          ADMINISTER_PROJECTS: {
            id: "23",
            name: "Administer Projects",
            havePermission: false,
          },
        },
      };
      expect(canCreateProjectVersion(res)).toBe(false);
    });

    it("fails closed on missing permission, null, undefined, or empty payload", () => {
      expect(canCreateProjectVersion(null)).toBe(false);
      expect(canCreateProjectVersion(undefined)).toBe(false);
      expect(canCreateProjectVersion({} as JiraMyPermissions)).toBe(false);
      expect(canCreateProjectVersion({ permissions: {} })).toBe(false);
      expect(
        canCreateProjectVersion({
          permissions: {
            BROWSE_PROJECTS: { id: "10", name: "Browse Projects", havePermission: true },
          },
        })
      ).toBe(false);
    });
  });

  describe("jiraWith(auth).getMyPermissions", () => {
    it("calls /rest/api/2/mypermissions?projectKey=EPM with user auth header", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        json({
          permissions: {
            ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: true },
          },
        })
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = jiraWith(auth);
      const res = await client.getMyPermissions("EPM");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://jira.example.com/rest/api/2/mypermissions?projectKey=EPM");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer user-token");
      expect(res.permissions.ADMINISTER_PROJECTS.havePermission).toBe(true);
    });

    it("encodes projectKey safely", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(json({ permissions: {} }));
      vi.stubGlobal("fetch", fetchMock);

      const client = jiraWith(auth);
      await client.getMyPermissions("PROJ/1&special=true");

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://jira.example.com/rest/api/2/mypermissions?projectKey=PROJ%2F1%26special%3Dtrue"
      );
    });

    it("throws 401 without calling fetch when auth or token is missing (no fallback to system token)", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const noTokenClient = jiraWith({ user: "alice", token: "", authMode: "Bearer" });
      await expect(noTokenClient.getMyPermissions("EPM")).rejects.toThrow(JiraRequestError);
      expect(fetchMock).not.toHaveBeenCalled();

      const undefinedAuthClient = jiraWith(undefined);
      await expect(undefinedAuthClient.getMyPermissions("EPM")).rejects.toThrow(JiraRequestError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("handles Jira 401 and 403 errors appropriately", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(json({ errorMessages: ["Unauthorized"] }, 401))
        .mockResolvedValueOnce(json({ errorMessages: ["Forbidden"] }, 403));
      vi.stubGlobal("fetch", fetchMock);

      const client = jiraWith(auth);

      await expect(client.getMyPermissions("EPM")).rejects.toMatchObject({
        name: "JiraRequestError",
        status: 401,
      });

      await expect(client.getMyPermissions("EPM")).rejects.toMatchObject({
        name: "JiraRequestError",
        status: 403,
      });
    });

    it("handles Jira 400 bad request error immediately", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ errorMessages: ["Bad request"] }, 400));
      vi.stubGlobal("fetch", fetchMock);

      const client = jiraWith(auth);
      await expect(client.getMyPermissions("EPM")).rejects.toMatchObject({
        name: "JiraRequestError",
        status: 400,
      });
    });

    it("handles Jira 500 error after retries", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ errorMessages: ["Server error"] }, 500));
      vi.stubGlobal("fetch", fetchMock);

      const client = jiraWith(auth);
      await expect(client.getMyPermissions("EPM")).rejects.toMatchObject({
        name: "JiraRequestError",
        status: 500,
      });
    }, 15000);
  });
});
