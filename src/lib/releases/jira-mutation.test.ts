import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  publishRelease,
  createReleaseWithJira,
  fetchProjectJiraVersions,
} from "./jira-mutation";
import { JiraRequestError } from "@/lib/jira/client";

const {
  prismaMock,
  userJiraAuthMock,
  jiraWithMock,
  releaseVersionMock,
  getVersionMock,
  getVersionsMock,
  getMyPermissionsMock,
  createVersionMock,
  getReleaseReadinessMock,
  auditMock,
  notifyAllMock,
} = vi.hoisted(() => {
  const releaseVersionMock = vi.fn();
  const getVersionMock = vi.fn();
  const getVersionsMock = vi.fn();
  const getMyPermissionsMock = vi.fn();
  const createVersionMock = vi.fn();

  const jiraWithMock = vi.fn(() => ({
    releaseVersion: releaseVersionMock,
    getVersion: getVersionMock,
    getVersions: getVersionsMock,
    getMyPermissions: getMyPermissionsMock,
    createVersion: createVersionMock,
  }));

  const userJiraAuthMock = vi.fn();
  const getReleaseReadinessMock = vi.fn();
  const auditMock = vi.fn().mockResolvedValue("audit-1");
  const notifyAllMock = vi.fn().mockResolvedValue(undefined);

  const prismaMock = {
    release: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    issueCache: {
      findMany: vi.fn(),
    },
    releaseTask: {
      createMany: vi.fn(),
    },
  };

  return {
    prismaMock,
    userJiraAuthMock,
    jiraWithMock,
    releaseVersionMock,
    getVersionMock,
    getVersionsMock,
    getMyPermissionsMock,
    createVersionMock,
    getReleaseReadinessMock,
    auditMock,
    notifyAllMock,
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/audit", () => ({ audit: auditMock }));
vi.mock("@/lib/notify", () => ({ notifyAll: notifyAllMock }));
vi.mock("@/lib/releases/release-readiness", () => ({
  getReleaseReadiness: getReleaseReadinessMock,
}));
vi.mock("@/lib/jira/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/client")>();
  return {
    ...actual,
    jiraWith: jiraWithMock,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  userJiraAuthMock.mockReturnValue({ user: "mgr", token: "tok", authMode: "Bearer" });
  prismaMock.user.findUnique.mockResolvedValue(null);
  prismaMock.issueCache.findMany.mockResolvedValue([]);
  prismaMock.releaseTask.createMany.mockResolvedValue({ count: 0 });
  getReleaseReadinessMock.mockResolvedValue({
    state: "ready",
    taskCount: 1,
    doneCount: 1,
    gitCompleteCount: 1,
    deliveryReadyCount: 1,
    blockers: [],
  });
  getVersionMock.mockResolvedValue({ id: "v1", released: false, archived: false });
  getVersionsMock.mockResolvedValue([{ id: "v1", released: false, archived: false }]);
  getMyPermissionsMock.mockResolvedValue({
    permissions: {
      ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: true },
    },
  });
  createVersionMock.mockResolvedValue({ id: "v1", name: "1.0", released: false, archived: false });
  releaseVersionMock.mockResolvedValue({ id: "v1" });
});

describe("Jira Mutation Service", () => {
  describe("publishRelease", () => {
    it("returns 404 if release does not exist", async () => {
      prismaMock.release.findUnique.mockResolvedValue(null);
      const res = await publishRelease("r-none", { id: "u1" });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not found" });
    });

    it("returns 200 already released if marked released in DB (idempotent, no Jira call)", async () => {
      const releasedAt = new Date("2026-10-09T00:00:00Z");
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "released",
        releasedAt,
      });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        released: true,
        already: true,
        releasedAt: releasedAt.toISOString(),
      });
      expect(releaseVersionMock).not.toHaveBeenCalled();
    });

    it("returns 409 if release not tied to Fix Version (missing projectKey or jiraVersionId)", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: null,
        jiraVersionId: null,
        status: "draft",
      });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: "release is not tied to a Jira Fix Version (projectKey + jiraVersionId required)",
      });
    });

    it("returns 428 if actor lacks Jira credentials", async () => {
      userJiraAuthMock.mockReturnValue(null);
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(428);
      expect(res.body).toHaveProperty("code", "jira_credentials_required");
      expect(releaseVersionMock).not.toHaveBeenCalled();
    });

    it("returns 200 idempotent sync if version is already released on Jira", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });
      getVersionMock.mockResolvedValue({ id: "v1", released: true, archived: false });
      prismaMock.release.update.mockResolvedValue({
        id: "r1",
        version: "1.0",
        status: "released",
        releasedAt: new Date(),
      });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("already", true);
      expect(releaseVersionMock).not.toHaveBeenCalled();
      expect(prismaMock.release.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "released" }) })
      );
    });

    it("returns 409 if version is archived on Jira", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });
      getVersionMock.mockResolvedValue({ id: "v1", released: false, archived: true });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error", "VERSION_ARCHIVED");
      expect(releaseVersionMock).not.toHaveBeenCalled();
    });

    it("returns 409 EMPTY_RELEASE if release readiness state is empty", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });
      getReleaseReadinessMock.mockResolvedValue({
        state: "empty",
        taskCount: 0,
        doneCount: 0,
        gitCompleteCount: 0,
        deliveryReadyCount: 0,
        blockers: [],
      });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error", "EMPTY_RELEASE");
      expect(releaseVersionMock).not.toHaveBeenCalled();
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "release.publish_failed" })
      );
    });

    it("returns 409 RELEASE_NOT_READY if blockers exist", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });
      getReleaseReadinessMock.mockResolvedValue({
        state: "in_progress",
        taskCount: 2,
        doneCount: 1,
        gitCompleteCount: 1,
        deliveryReadyCount: 1,
        blockers: [{ code: "TASK_NOT_DONE", jiraKey: "EPM-2" }],
      });

      const res = await publishRelease("r1", { id: "u1" });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error", "RELEASE_NOT_READY");
      expect(releaseVersionMock).not.toHaveBeenCalled();
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "release.publish_failed" })
      );
    });

    it("returns 502 if Jira releaseVersion fails", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });
      releaseVersionMock.mockRejectedValue(new Error("Jira connection timeout"));

      const res = await publishRelease("r1", { id: "u1", email: "mgr@test.io" });
      expect(res.status).toBe(502);
      expect(res.body).toHaveProperty("error", "Jira release failed");
      expect(prismaMock.release.update).not.toHaveBeenCalled();
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "release.publish_failed" })
      );
    });

    it("successfully publishes release: calls Jira once, updates DB, audits, notifies", async () => {
      prismaMock.release.findUnique.mockResolvedValue({
        id: "r1",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v1",
        status: "draft",
      });
      prismaMock.release.update.mockResolvedValue({
        id: "r1",
        version: "1.0",
        status: "released",
        releasedAt: new Date(),
      });

      const res = await publishRelease("r1", { id: "u1", email: "mgr@test.io" });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("released", true);
      expect(res.body).toHaveProperty("already", false);
      expect(releaseVersionMock).toHaveBeenCalledWith("v1");
      expect(prismaMock.release.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "released" }) })
      );
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "release.publish" })
      );
      expect(notifyAllMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("createReleaseWithJira", () => {
    it("returns 400 if version is empty", async () => {
      const res = await createReleaseWithJira({ version: "   " }, { id: "u1" });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "version required" });
    });

    it("returns 400 if neither projectKey nor targetLabel is provided", async () => {
      const res = await createReleaseWithJira({ version: "1.0" }, { id: "u1" });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    it("returns 428 if actor lacks Jira credentials", async () => {
      userJiraAuthMock.mockReturnValue(null);
      const res = await createReleaseWithJira({ projectKey: "EPM", version: "1.0" }, { id: "u1" });
      expect(res.status).toBe(428);
      expect(res.body).toHaveProperty("code", "jira_credentials_required");
    });

    it("returns 403 jira_project_permission_required if user lacks permission to create version", async () => {
      getMyPermissionsMock.mockResolvedValue({
        permissions: {
          ADMINISTER_PROJECTS: { id: "23", name: "Administer Projects", havePermission: false },
        },
      });

      const res = await createReleaseWithJira({ projectKey: "EPM", version: "1.0" }, { id: "u1" });
      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("code", "jira_project_permission_required");
      expect(createVersionMock).not.toHaveBeenCalled();
    });

    it("returns 404 if specified jiraVersionId does not exist on Jira", async () => {
      getVersionsMock.mockResolvedValue([{ id: "other-v", name: "Other" }]);
      const res = await createReleaseWithJira(
        { projectKey: "EPM", version: "1.0", jiraVersionId: "missing-v" },
        { id: "u1" }
      );
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error");
    });

    it("creates Fix Version on Jira and persists release record", async () => {
      createVersionMock.mockResolvedValue({ id: "v100", name: "1.0", released: false });
      prismaMock.release.findFirst.mockResolvedValue(null);
      prismaMock.release.create.mockResolvedValue({
        id: "r100",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v100",
        status: "draft",
      });

      const res = await createReleaseWithJira(
        { projectKey: "EPM", version: "1.0", description: "Release 1" },
        { id: "u1", email: "mgr@test.io" }
      );
      expect(res.status).toBe(200);
      expect(createVersionMock).toHaveBeenCalledWith("EPM", "1.0", "Release 1");
      expect(prismaMock.release.create).toHaveBeenCalled();
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: "release.create" })
      );
    });

    it("links existing Fix Version from Jira", async () => {
      getVersionsMock.mockResolvedValue([{ id: "v100", name: "1.0", released: false }]);
      prismaMock.release.findFirst.mockResolvedValue(null);
      prismaMock.release.create.mockResolvedValue({
        id: "r100",
        version: "1.0",
        projectKey: "EPM",
        jiraVersionId: "v100",
        status: "draft",
      });

      const res = await createReleaseWithJira(
        { projectKey: "EPM", version: "1.0", jiraVersionId: "v100" },
        { id: "u1" }
      );
      expect(res.status).toBe(200);
      expect(createVersionMock).not.toHaveBeenCalled();
      expect(prismaMock.release.create).toHaveBeenCalled();
    });

    it("handles JiraRequestError 401 as 502 jira_auth_failed", async () => {
      getMyPermissionsMock.mockRejectedValue(new JiraRequestError("Invalid token", 401, false));
      const res = await createReleaseWithJira({ projectKey: "EPM", version: "1.0" }, { id: "u1" });
      expect(res.status).toBe(502);
      expect(res.body).toHaveProperty("code", "jira_auth_failed");
    });
  });

  describe("fetchProjectJiraVersions", () => {
    it("returns versions from Jira client", async () => {
      const mockVersions = [{ id: "v1", name: "1.0" }];
      getVersionsMock.mockResolvedValue(mockVersions);

      const res = await fetchProjectJiraVersions("EPM", { user: "u", token: "t", authMode: "Bearer" });
      expect(res).toEqual(mockVersions);
      expect(getVersionsMock).toHaveBeenCalledWith("EPM");
    });
  });
});
