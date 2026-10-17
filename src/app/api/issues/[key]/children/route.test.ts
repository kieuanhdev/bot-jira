import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIssue: vi.fn(),
  getCreateMetadata: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({}) } } }));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: () => ({ user: "u", token: "t", authMode: "Bearer" }) }));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: mocks.refresh }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getIssue: mocks.getIssue,
    getCreateMetadata: mocks.getCreateMetadata,
    createIssue: mocks.createIssue,
    updateIssue: mocks.updateIssue,
  }),
}));

import { GET, POST } from "./route";

const TYPES = [
  { id: "1", name: "Task", subtask: false },
  { id: "2", name: "Epic", subtask: false },
  { id: "3", name: "Sub-task", subtask: true, fields: { summary: { required: true, name: "Summary" } } },
];

function parentOf(type: { name: string; subtask: boolean }) {
  mocks.getIssue.mockResolvedValue({ fields: { project: { key: "ABC" }, issuetype: type } });
}

const ctx = { params: Promise.resolve({ key: "abc-1" }) };
const post = (body: unknown) =>
  POST(new Request("http://app/api/issues/ABC-1/children", { method: "POST", body: JSON.stringify(body) }), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCreateMetadata.mockResolvedValue({ projects: [{ key: "ABC", issuetypes: TYPES }] });
  mocks.createIssue.mockResolvedValue({ key: "ABC-9" });
  mocks.updateIssue.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(true);
});

describe("GET children options", () => {
  it("offers sub-task types under a normal task", async () => {
    parentOf({ name: "Task", subtask: false });
    const body = await (await GET(new Request("http://app"), ctx)).json();
    expect(body).toEqual({ mode: "subtask", types: [{ id: "3", name: "Sub-task" }] });
  });

  it("offers regular non-epic types under an Epic", async () => {
    parentOf({ name: "Epic", subtask: false });
    const body = await (await GET(new Request("http://app"), ctx)).json();
    expect(body).toEqual({ mode: "epic", types: [{ id: "1", name: "Task" }] });
  });

  it("offers nothing under a sub-task", async () => {
    parentOf({ name: "Sub-task", subtask: true });
    const body = await (await GET(new Request("http://app"), ctx)).json();
    expect(body).toEqual({ mode: "none", types: [] });
  });
});

describe("POST create child", () => {
  it("creates a sub-task with the parent key", async () => {
    parentOf({ name: "Task", subtask: false });
    const res = await post({ summary: "  Làm phần A ", issueTypeId: "3" });
    expect(res.status).toBe(200);
    expect(mocks.createIssue).toHaveBeenCalledWith({
      projectKey: "ABC",
      issueTypeId: "3",
      summary: "Làm phần A",
      fields: { parent: { key: "ABC-1" } },
    });
    expect(mocks.updateIssue).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("creates a task under an Epic then links it through updateIssue", async () => {
    parentOf({ name: "Epic", subtask: false });
    const res = await post({ summary: "Việc mới", issueTypeId: "1" });
    expect((await res.json()).linkError).toBeNull();
    expect(mocks.createIssue).toHaveBeenCalledWith({ projectKey: "ABC", issueTypeId: "1", summary: "Việc mới" });
    expect(mocks.updateIssue).toHaveBeenCalledWith("ABC-9", { epic: "ABC-1" });
  });

  it("reports, not throws, when the epic link fails after creation", async () => {
    parentOf({ name: "Epic", subtask: false });
    mocks.updateIssue.mockRejectedValue(new Error("boom"));
    const res = await post({ summary: "Việc mới", issueTypeId: "1" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.key).toBe("ABC-9");
    expect(body.linkError).toBe("boom");
  });

  it("rejects a child under a sub-task", async () => {
    parentOf({ name: "Sub-task", subtask: true });
    expect((await post({ summary: "x", issueTypeId: "3" })).status).toBe(400);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("rejects a type outside the allowed list", async () => {
    parentOf({ name: "Task", subtask: false });
    expect((await post({ summary: "x", issueTypeId: "1" })).status).toBe(400);
    expect((await post({ summary: "x" })).status).toBe(400);
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("rejects an empty summary", async () => {
    parentOf({ name: "Task", subtask: false });
    expect((await post({ summary: "  ", issueTypeId: "3" })).status).toBe(400);
  });

  it("names required fields it cannot fill", async () => {
    parentOf({ name: "Task", subtask: false });
    mocks.getCreateMetadata.mockResolvedValue({
      projects: [
        {
          key: "ABC",
          issuetypes: [
            { id: "3", name: "Sub-task", subtask: true, fields: { customfield_1: { required: true, name: "Module" } } },
          ],
        },
      ],
    });
    const res = await post({ summary: "x", issueTypeId: "3" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Module");
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });
});
