import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  issueCache: vi.fn(),
  getEditMeta: vi.fn(),
  resolvePointsField: vi.fn(),
  getCreateMetaIssueTypes: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findFirst: mocks.issueCache },
  },
}));
vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    isCatalogProject: vi.fn().mockImplementation(async (key: string) => ["EPM", "MHRM"].includes(key.toUpperCase())),
  };
});
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "token", authMode: "Bearer" }),
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getEditMeta: mocks.getEditMeta,
    resolvePointsField: mocks.resolvePointsField,
    getCreateMetaIssueTypes: mocks.getCreateMetaIssueTypes,
  }),
}));

import { GET } from "./route";

describe("GET /api/bulk/fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "encrypted" });
    mocks.issueCache.mockResolvedValue({ jiraKey: "EPM-101" });
    mocks.getEditMeta.mockResolvedValue({
      fields: {
        assignee: { name: "Assignee" },
        labels: { name: "Labels" },
        priority: { name: "Priority" },
        issuetype: { name: "Issue Type" },
        timetracking: { name: "Time Tracking" },
        duedate: { name: "Due Date" },
        fixVersions: { name: "Fix Version/s" },
      },
    });
    mocks.resolvePointsField.mockResolvedValue({ id: "customfield_10502", name: "Task Points" });
    mocks.getCreateMetaIssueTypes.mockResolvedValue({ values: [{ id: "1", name: "Task" }, { id: "2", name: "Bug" }] });
  });

  it("returns editable fields metadata for the selected project", async () => {
    const response = await GET(new Request("http://localhost/api/bulk/fields?project=EPM"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.project).toBe("EPM");
    expect(body.sampleKey).toBe("EPM-101");
    expect(body.fallback).toBe(false);
    expect(body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "assignee", available: true }),
        expect.objectContaining({ id: "labels", available: true }),
        expect.objectContaining({ id: "priority", available: true }),
        expect.objectContaining({ id: "issueType", available: true, options: ["Task", "Bug"] }),
        expect.objectContaining({ id: "points", available: true, jiraFieldId: "customfield_10502" }),
        expect.objectContaining({ id: "estimate", available: true, jiraFieldId: "timetracking" }),
        expect.objectContaining({ id: "dueDate", available: true, jiraFieldId: "duedate" }),
        expect.objectContaining({ id: "fixVersions", available: true, jiraFieldId: "fixVersions" }),
      ])
    );
  });

  it("marks unavailable fields as available: false when missing from Jira editmeta", async () => {
    mocks.getEditMeta.mockResolvedValue({
      fields: {
        assignee: { name: "Assignee" },
        labels: { name: "Labels" },
      },
    });
    mocks.resolvePointsField.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/bulk/fields?project=EPM"));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "assignee", available: true }),
        expect.objectContaining({ id: "labels", available: true }),
        expect.objectContaining({ id: "priority", available: false }),
        expect.objectContaining({ id: "issueType", available: false }),
        expect.objectContaining({ id: "points", available: false }),
        expect.objectContaining({ id: "estimate", available: false }),
        expect.objectContaining({ id: "dueDate", available: false }),
        expect.objectContaining({ id: "fixVersions", available: false }),
      ])
    );
  });

  it("returns 400 for unknown or missing project", async () => {
    const res1 = await GET(new Request("http://localhost/api/bulk/fields"));
    expect(res1.status).toBe(400);

    const res2 = await GET(new Request("http://localhost/api/bulk/fields?project=UNKNOWN"));
    expect(res2.status).toBe(400);
  });

  it("returns 401 without session", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/bulk/fields?project=EPM"));
    expect(res.status).toBe(401);
  });
});
