import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const { prismaMock, sessionMock, canMock, releaseVersionMock, notifyAllMock, userJiraAuthMock, getReleaseReadinessMock } = vi.hoisted(() => {
  const releaseVersionMock = vi.fn();
  const notifyAllMock = vi.fn(() => Promise.resolve());
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const userJiraAuthMock = vi.fn();
  const getReleaseReadinessMock = vi.fn();
  const prismaMock = {
    release: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { prismaMock, sessionMock, canMock, releaseVersionMock, notifyAllMock, userJiraAuthMock, getReleaseReadinessMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("a1") }));
vi.mock("@/lib/notify", () => ({ notifyAll: notifyAllMock }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    releaseVersion: releaseVersionMock,
    getVersion: vi.fn().mockResolvedValue({ id: "v1", released: false }),
    getVersions: vi.fn().mockResolvedValue([{ id: "v1", released: false }]),
  }),
}));
vi.mock("@/lib/releases/release-readiness", () => ({
  getReleaseReadiness: getReleaseReadinessMock,
}));

const ctx = () => ({ params: Promise.resolve({ id: "r1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", email: "r@t.io", role: "release_manager" } });
  canMock.mockReturnValue(true);
  prismaMock.user.findUnique.mockResolvedValue(null);
  userJiraAuthMock.mockReturnValue({ user: "release-manager", token: "personal-token", authMode: "Bearer" });
  releaseVersionMock.mockResolvedValue({ id: "v1" });
  getReleaseReadinessMock.mockResolvedValue({
    state: "ready",
    taskCount: 1,
    doneCount: 1,
    gitCompleteCount: 1,
    deliveryReadyCount: 1,
    blockers: [],
    tasks: [],
  });
});

describe("POST /api/releases/:id/release", () => {
  it("returns 403 when the actor cannot publish", async () => {
    canMock.mockReturnValue(false);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(403);
  });

  it("is idempotent for an already-released release (no Jira call)", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "released", releasedAt: new Date(),
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.already).toBe(true);
    expect(releaseVersionMock).not.toHaveBeenCalled();
  });

  it("returns 409 for an empty release and does not call Jira", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "draft",
    });
    getReleaseReadinessMock.mockResolvedValueOnce({
      state: "empty",
      taskCount: 0,
      doneCount: 0,
      gitCompleteCount: 0,
      deliveryReadyCount: 0,
      blockers: [],
      tasks: [],
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("EMPTY_RELEASE");
    expect(releaseVersionMock).not.toHaveBeenCalled();
  });

  it("returns 409 with blockers when tasks or PRs are not ready", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "draft",
    });
    getReleaseReadinessMock.mockResolvedValueOnce({
      state: "in_progress",
      taskCount: 2,
      doneCount: 1,
      gitCompleteCount: 1,
      deliveryReadyCount: 1,
      blockers: [
        { code: "TASK_NOT_DONE", jiraKey: "EPM-2", summary: "Task 2", status: "In Progress" },
      ],
      tasks: [],
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe("RELEASE_NOT_READY");
    expect(body.blockers).toHaveLength(1);
    expect(releaseVersionMock).not.toHaveBeenCalled();
  });

  it("calls Jira once and marks DB released on a ready release", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "draft",
    });
    prismaMock.release.update.mockResolvedValue({ id: "r1", version: "1.0", status: "released", releasedAt: new Date() });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.released).toBe(true);
    expect(releaseVersionMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.release.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "released" }) })
    );
  });

  it("does not mark released when Jira fails", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "draft",
    });
    releaseVersionMock.mockRejectedValue(new Error("Jira API 500"));
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(502);
    expect(prismaMock.release.update).not.toHaveBeenCalled();
  });

  it("returns 428 when user lacks Jira credentials", async () => {
    userJiraAuthMock.mockReturnValue(null);
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "draft",
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(428);
    expect(releaseVersionMock).not.toHaveBeenCalled();
  });
});
