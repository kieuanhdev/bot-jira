import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getFields: vi.fn(),
  getIssue: vi.fn(),
  getCreateMetadata: vi.fn(),
  createIssue: vi.fn(),
  getIssueLinkTypes: vi.fn(),
  createIssueLink: vi.fn(),
  refreshCache: vi.fn(),
  peopleFields: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "t", authMode: "Bearer" as const }),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getFields: mocks.getFields,
    getIssue: mocks.getIssue,
    getCreateMetadata: mocks.getCreateMetadata,
    createIssue: mocks.createIssue,
    getIssueLinkTypes: mocks.getIssueLinkTypes,
    createIssueLink: mocks.createIssueLink,
  }),
  jiraPointsFromFields: () => ({ points: 5, fieldId: "customfield_10006" }),
}));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: mocks.refreshCache }));
vi.mock("@/lib/jira/people-fields", () => ({ getProjectPeopleFields: mocks.peopleFields }));
vi.mock("@/lib/issues/epic", () => ({ getEpicLinkFieldIds: () => ["customfield_10100"] }));

import { POST } from "./route";

const CLONERS = { id: "10000", name: "Cloners", inward: "is cloned by", outward: "clones" };

function sourceIssue() {
  return {
    id: "1001",
    key: "EPM-10",
    self: "https://jira.example.com/rest/api/2/issue/1001",
    fields: {
      project: { key: "EPM" },
      issuetype: { id: "10002", name: "Task" },
      summary: "Fix the login redirect",
      description: "h2. Steps",
      labels: ["backend"],
      customfield_10006: 5,
    },
  };
}

function request(body: unknown = {}) {
  return new Request("http://localhost/api/issues/EPM-10/clone", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ key: "EPM-10" }) };

describe("POST /api/issues/[key]/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc", jiraUserEnc: "enc", jiraAuth: "Bearer" });
    mocks.getFields.mockResolvedValue([]);
    mocks.getIssue.mockImplementation((key: string, fields?: string) =>
      Promise.resolve(
        fields === "issuelinks"
          ? {
              key,
              fields: { issuelinks: [{ id: "5", type: CLONERS, outwardIssue: { key: "EPM-10" } }] },
            }
          : sourceIssue()
      )
    );
    mocks.getCreateMetadata.mockResolvedValue({
      projects: [
        {
          id: "1",
          key: "EPM",
          name: "EPM",
          issuetypes: [
            {
              id: "10002",
              name: "Task",
              fields: {
                summary: { required: true, name: "Summary" },
                description: { required: false, name: "Description" },
                labels: { required: false, name: "Labels" },
                customfield_10006: { required: false, name: "Story Points" },
                customfield_10104: { required: true, name: "Epic Name" },
              },
            },
          ],
        },
      ],
    });
    mocks.createIssue.mockResolvedValue({ id: "2002", key: "EPM-11", self: "…" });
    mocks.getIssueLinkTypes.mockResolvedValue({ issueLinkTypes: [CLONERS] });
    mocks.createIssueLink.mockResolvedValue(undefined);
    mocks.refreshCache.mockResolvedValue(true);
    mocks.peopleFields.mockResolvedValue({ reporter: "reporter", approver: "customfield_10300" });
  });

  it("creates the copy, links it to the source and caches both issues", async () => {
    const res = await POST(request(), ctx);
    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload).toMatchObject({ ok: true, key: "EPM-11", relation: "clones", linkError: null });
    expect(mocks.createIssue).toHaveBeenCalledWith({
      projectKey: "EPM",
      issueTypeId: "10002",
      summary: "CLONE - Fix the login redirect",
      fields: { description: "h2. Steps", labels: ["backend"], customfield_10006: 5 },
    });
    // The copy is the inward end, so Jira reads it as "EPM-11 clones EPM-10".
    expect(mocks.createIssueLink).toHaveBeenCalledWith("Cloners", "EPM-11", "EPM-10");
    expect(mocks.refreshCache.mock.calls.map((call) => call[1]).sort()).toEqual([
      "EPM-10",
      "EPM-11",
    ]);
  });

  it("copies a required create-screen field such as Epic Name", async () => {
    mocks.getIssue.mockImplementation((key: string, fields?: string) =>
      Promise.resolve(
        fields === "issuelinks"
          ? { key, fields: { issuelinks: [] } }
          : {
              ...sourceIssue(),
              fields: { ...sourceIssue().fields, customfield_10104: "Checkout revamp" },
            }
      )
    );

    await POST(request(), ctx);
    expect(mocks.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ customfield_10104: "Checkout revamp" }),
      })
    );
  });

  it("uses the summary the caller edited", async () => {
    await POST(request({ summary: "  Bản sao cho sprint sau  " }), ctx);
    expect(mocks.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Bản sao cho sprint sau" })
    );
  });

  it("keeps the created issue when linking fails", async () => {
    mocks.createIssueLink.mockRejectedValue(new Error("no link permission"));

    const res = await POST(request(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      key: "EPM-11",
      linkError: "no link permission",
    });
  });

  it("reports a missing clone link type without failing the copy", async () => {
    mocks.getIssueLinkTypes.mockResolvedValue({ issueLinkTypes: [] });

    const payload = await (await POST(request(), ctx)).json();
    expect(payload.key).toBe("EPM-11");
    expect(payload.linkError).toMatch(/liên kết/);
    expect(mocks.createIssueLink).not.toHaveBeenCalled();
  });

  it("answers 403 when Jira rejects the create", async () => {
    mocks.createIssue.mockRejectedValue(
      Object.assign(new Error("forbidden"), { status: 403 })
    );

    const res = await POST(request(), ctx);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: "permission" });
  });

  it("answers 502 when Jira rejects the create for another reason", async () => {
    mocks.createIssue.mockRejectedValue(
      Object.assign(new Error("Field 'customfield_1' cannot be set"), { status: 400 })
    );

    const res = await POST(request(), ctx);
    expect(res.status).toBe(502);
    expect(mocks.createIssueLink).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(request(), ctx);
    expect(res.status).toBe(401);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("rejects an over-long summary", async () => {
    const res = await POST(request({ summary: "x".repeat(256) }), ctx);
    expect(res.status).toBe(400);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });
});
