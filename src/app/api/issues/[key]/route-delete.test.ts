import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userAuth: vi.fn(),
  deleteIssue: vi.fn(),
  markDeleted: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userAuth }));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: vi.fn(),
  jiraWith: () => ({ deleteIssue: mocks.deleteIssue }),
}));
vi.mock("@/lib/issues/live", () => ({ getIssueView: vi.fn(), getCachedIssueView: vi.fn() }));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: vi.fn() }));
vi.mock("@/lib/jira/people-fields", () => ({ getProjectPeopleFields: vi.fn() }));
vi.mock("@/lib/issues/deleted", () => ({ markIssuesDeleted: mocks.markDeleted }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { DELETE } from "./route";

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const req = () => new Request("http://localhost/api/issues/EPM-1", { method: "DELETE" });

describe("DELETE /api/issues/[key]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u1", email: "a@b.c" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userAuth.mockReturnValue({ user: "alice", token: "t", authMode: "Bearer" });
    mocks.deleteIssue.mockResolvedValue(undefined);
    mocks.markDeleted.mockResolvedValue(1);
  });

  it("requires a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await DELETE(req(), ctx("EPM-1"))).status).toBe(401);
    expect(mocks.deleteIssue).not.toHaveBeenCalled();
  });

  it("rejects malformed keys", async () => {
    expect((await DELETE(req(), ctx("nope"))).status).toBe(400);
    expect(mocks.deleteIssue).not.toHaveBeenCalled();
  });

  it("never falls back to the system account", async () => {
    mocks.userAuth.mockReturnValue(null);
    const res = await DELETE(req(), ctx("EPM-1"));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(mocks.deleteIssue).not.toHaveBeenCalled();
  });

  it("deletes in Jira, hides locally and audits", async () => {
    const res = await DELETE(req(), ctx("epm-1"));
    expect(res.status).toBe(200);
    expect(mocks.deleteIssue).toHaveBeenCalledWith("EPM-1");
    expect(mocks.markDeleted).toHaveBeenCalledWith(["EPM-1"]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "issue.delete", target: "EPM-1" }));
  });

  it("keeps the local row when Jira forbids the delete", async () => {
    mocks.deleteIssue.mockRejectedValue(Object.assign(new Error("x"), { status: 403 }));
    expect((await DELETE(req(), ctx("EPM-1"))).status).toBe(403);
    expect(mocks.markDeleted).not.toHaveBeenCalled();
  });

  it("syncs locally when Jira already lost the issue", async () => {
    mocks.deleteIssue.mockRejectedValue(Object.assign(new Error("x"), { status: 404 }));
    expect((await DELETE(req(), ctx("EPM-1"))).status).toBe(200);
    expect(mocks.markDeleted).toHaveBeenCalledWith(["EPM-1"]);
  });
});
