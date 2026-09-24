import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const { prismaMock, sessionMock, canMock, releaseVersionMock, notifyAllMock, userJiraAuthMock } = vi.hoisted(() => {
  const releaseVersionMock = vi.fn();
  const notifyAllMock = vi.fn(() => Promise.resolve());
  const sessionMock = vi.fn();
  const canMock = vi.fn();
  const userJiraAuthMock = vi.fn();
  const prismaMock = {
    release: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { prismaMock, sessionMock, canMock, releaseVersionMock, notifyAllMock, userJiraAuthMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
vi.mock("@/lib/permissions", () => ({ can: canMock }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue("a1") }));
vi.mock("@/lib/notify", () => ({ notifyAll: notifyAllMock }));
vi.mock("@/lib/ai", () => ({ aiProvider: { releaseCheck: vi.fn() } }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: userJiraAuthMock }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ releaseVersion: releaseVersionMock }),
}));
vi.mock("@/lib/releases/gates", () => ({
  runGates: vi.fn().mockResolvedValue([
    { gate: "non_empty_release", state: "passed", summary: "ok", blockers: [] },
  ]),
  aggregateGates: vi.fn().mockReturnValue("ready"),
  collectBlockers: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/releases/release-context", () => ({
  buildReleaseContext: vi.fn().mockResolvedValue({ tasks: [{ jiraKey: "EPM-1" }], checkedAt: new Date() }),
}));

const ctx = () => ({ params: Promise.resolve({ id: "r1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { id: "u1", email: "r@t.io", role: "release_manager" } });
  canMock.mockReturnValue(true);
  prismaMock.user.findUnique.mockResolvedValue(null);
  userJiraAuthMock.mockReturnValue({ user: "release-manager", token: "personal-token", authMode: "Bearer" });
  releaseVersionMock.mockResolvedValue({ id: "v1" });
});

describe("POST /api/releases/:id/release (REL-02)", () => {
  it("returns 403 when the actor cannot publish", async () => {
    canMock.mockReturnValue(false);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(403);
  });

  it("is idempotent for an already-released release (no Jira call)", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "released", releasedAt: new Date(), tasks: [],
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
      status: "ready", tasks: [],
    });
    const { buildReleaseContext } = await import("@/lib/releases/release-context");
    vi.mocked(buildReleaseContext).mockResolvedValueOnce({ tasks: [] } as never);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(409);
    expect(releaseVersionMock).not.toHaveBeenCalled();
  });

  it("calls Jira once, flips DB to released, on a ready release", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "ready", tasks: [{ jiraKey: "EPM-1" }],
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
      status: "ready", tasks: [{ jiraKey: "EPM-1" }],
    });
    releaseVersionMock.mockRejectedValue(new Error("Jira 500"));
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(502);
    expect(prismaMock.release.update).not.toHaveBeenCalled();
  });

  it("requires the actor's personal Jira credential", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1", version: "1.0", projectKey: "EPM", jiraVersionId: "v1",
      status: "ready", tasks: [{ jiraKey: "EPM-1" }],
    });
    userJiraAuthMock.mockReturnValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(428);
    expect(releaseVersionMock).not.toHaveBeenCalled();
  });
});
