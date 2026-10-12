import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getIssueLinkTypes: vi.fn(),
  createIssueLink: vi.fn(),
  getIssue: vi.fn(),
  refreshCache: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "t", authMode: "Bearer" as const }),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getIssueLinkTypes: mocks.getIssueLinkTypes,
    createIssueLink: mocks.createIssueLink,
    getIssue: mocks.getIssue,
  }),
}));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: mocks.refreshCache }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));

import { GET, POST } from "./route";

const BLOCKS = { id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" };

function request(body: unknown) {
  return new Request("http://localhost/api/issues/EPM-10/links", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ key: "EPM-10" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "u1", email: "alice@example.com" } });
  mocks.user.mockResolvedValue({ jiraUserEnc: "x", jiraTokenEnc: "y", jiraAuth: "bearer" });
  mocks.getIssueLinkTypes.mockResolvedValue({ issueLinkTypes: [BLOCKS] });
  mocks.createIssueLink.mockResolvedValue(undefined);
  mocks.getIssue.mockResolvedValue({ fields: { issuelinks: [] } });
  mocks.refreshCache.mockResolvedValue(true);
  mocks.audit.mockResolvedValue("audit-1");
});

describe("GET /api/issues/[key]/links", () => {
  it("returns the instance's link types", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      items: [{ id: "10001", name: "Blocks", inward: "is blocked by", outward: "blocks" }],
    });
  });

  it("rejects an anonymous caller", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});

describe("POST /api/issues/[key]/links", () => {
  it("links this issue as the inward side for an outward phrase", async () => {
    const res = await POST(request({ typeName: "Blocks", direction: "outward", targetKey: "EPM-20" }), ctx);
    expect(res.status).toBe(200);
    // Reads "EPM-10 blocks EPM-20".
    expect(mocks.createIssueLink).toHaveBeenCalledWith("Blocks", "EPM-10", "EPM-20");
  });

  it("swaps the pair for an inward phrase", async () => {
    await POST(request({ typeName: "Blocks", direction: "inward", targetKey: "EPM-20" }), ctx);
    // "EPM-10 is blocked by EPM-20" === "EPM-20 blocks EPM-10".
    expect(mocks.createIssueLink).toHaveBeenCalledWith("Blocks", "EPM-20", "EPM-10");
  });

  it("refreshes both issues so each side shows the new relation", async () => {
    await POST(request({ typeName: "Blocks", direction: "outward", targetKey: "epm-20" }), ctx);
    const refreshed = mocks.refreshCache.mock.calls.map((c) => c[1]);
    expect(refreshed).toEqual(["EPM-10", "EPM-20"]);
  });

  it("rejects a malformed target key", async () => {
    const res = await POST(request({ typeName: "Blocks", targetKey: "not a key" }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.createIssueLink).not.toHaveBeenCalled();
  });

  it("rejects linking an issue to itself", async () => {
    const res = await POST(request({ typeName: "Blocks", targetKey: "EPM-10" }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.createIssueLink).not.toHaveBeenCalled();
  });

  it("rejects a missing link type", async () => {
    const res = await POST(request({ targetKey: "EPM-20" }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.createIssueLink).not.toHaveBeenCalled();
  });

  it("maps a Jira permission failure to 403", async () => {
    mocks.createIssueLink.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    const res = await POST(request({ typeName: "Blocks", targetKey: "EPM-20" }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.refreshCache).not.toHaveBeenCalled();
  });

  it("treats an empty-body failure as success when Jira stored the link", async () => {
    // Jira answers POST /issueLink with 201 and no body; a strict JSON parse
    // throws even though the link landed.
    mocks.createIssueLink.mockRejectedValue(new Error("Unexpected end of JSON input"));
    mocks.getIssue.mockResolvedValue({
      fields: { issuelinks: [{ type: { outward: "blocks" }, outwardIssue: { key: "EPM-20" } }] },
    });
    const res = await POST(request({ typeName: "Blocks", targetKey: "EPM-20" }), ctx);
    expect(res.status).toBe(200);
    expect(mocks.refreshCache).toHaveBeenCalled();
  });

  it("reports 502 when the link really did not land", async () => {
    mocks.createIssueLink.mockRejectedValue(new Error("upstream exploded"));
    const res = await POST(request({ typeName: "Blocks", targetKey: "EPM-20" }), ctx);
    expect(res.status).toBe(502);
    expect(mocks.refreshCache).not.toHaveBeenCalled();
  });

  it("maps an unknown target to 404", async () => {
    mocks.createIssueLink.mockRejectedValue(Object.assign(new Error("missing"), { status: 404 }));
    const res = await POST(request({ typeName: "Blocks", targetKey: "EPM-99" }), ctx);
    expect(res.status).toBe(404);
  });
});
