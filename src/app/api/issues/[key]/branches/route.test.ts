import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  issueFindUnique: vi.fn(),
  branchFindMany: vi.fn(),
  linkFindMany: vi.fn(),
  syncJiraDevStatusForIssue: vi.fn(),
  createBranchForIssue: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findUnique: mocks.issueFindUnique },
    branchInfo: { findMany: mocks.branchFindMany },
    branchIssueLink: { findMany: mocks.linkFindMany },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: vi.fn((user: { jiraTokenEnc?: string | null } | null | undefined) =>
    user?.jiraTokenEnc ? { user: "alice", token: "tok", authMode: "Bearer" } : null
  ),
  userBitbucketCreds: vi.fn((user: { bitbucketTokenEnc?: string | null } | null | undefined) =>
    user?.bitbucketTokenEnc ? { user: "alice_bb", token: "bb_tok" } : null
  ),
}));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: vi.fn().mockResolvedValue(null),
  jiraWith: vi.fn(() => ({})),
}));
vi.mock("@/lib/jira/dev-status", () => ({
  syncJiraDevStatusForIssue: mocks.syncJiraDevStatusForIssue,
}));
vi.mock("@/lib/bulk/ops", () => ({
  createBranchForIssue: mocks.createBranchForIssue,
}));

import { GET } from "./route";

describe("GET /api/issues/[key]/branches", () => {
  const ctx = { params: Promise.resolve({ key: "EPM-4365" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when issue not found", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.issueFindUnique.mockResolvedValueOnce(null);

    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns cached branches when present", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.issueFindUnique.mockResolvedValueOnce({ labels: [] });
    mocks.linkFindMany.mockResolvedValueOnce([
      { jiraKey: "EPM-4365", branch: { repo: "EPM/feat_bill", branch: "hotfix/EPM-4365", jiraKey: "EPM-4365" } },
    ]);
    mocks.branchFindMany.mockResolvedValueOnce([]); // suggested

    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toHaveLength(1);
    expect(mocks.syncJiraDevStatusForIssue).not.toHaveBeenCalled();
  });

  it("triggers sync when cached branches are empty", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "user-1" } });
    mocks.user.mockResolvedValueOnce({ jiraTokenEnc: "tok" });
    mocks.issueFindUnique.mockResolvedValueOnce({ labels: [] });
    // First query empty -> sync -> second query returns branch
    mocks.linkFindMany
      .mockResolvedValueOnce([]) // initial
      .mockResolvedValueOnce([
        { jiraKey: "EPM-4365", branch: { repo: "EPM/feat_bill", branch: "hotfix/EPM-4365", jiraKey: "EPM-4365" } },
      ]); // after sync
    mocks.branchFindMany.mockResolvedValueOnce([]); // suggested

    mocks.syncJiraDevStatusForIssue.mockResolvedValueOnce({
      ok: true,
      syncedBranches: [{ repo: "EPM/feat_bill", branch: "hotfix/EPM-4365", merged: false }],
    });

    const res = await GET(new Request("http://localhost"), ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(mocks.syncJiraDevStatusForIssue).toHaveBeenCalledWith("EPM-4365", expect.anything());
    expect(data.items).toHaveLength(1);
  });
});
