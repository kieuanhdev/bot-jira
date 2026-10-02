import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userJiraAuth: vi.fn(),
  getIssue: vi.fn(),
  searchTemplateIssues: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getIssue: mocks.getIssue,
    searchTemplateIssues: mocks.searchTemplateIssues,
  }),
  jiraIssueFields: () => "summary,issuetype,status,assignee,updated,parent",
  JiraRequestError: class extends Error {
    constructor(msg: string, public status = 400, public retryable = false) {
      super(msg);
    }
  },
}));

import { GET } from "./route";

describe("GET /api/bulk/create/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok-12345678", authMode: "Bearer" });
  });

  it("returns recent issues list when issueKey is omitted", async () => {
    mocks.searchTemplateIssues.mockResolvedValue([
      {
        key: "EPM-100",
        summary: "Setup database",
        issueTypeId: "10001",
        issueTypeName: "Task",
        isSubtask: false,
        status: "In Progress",
      },
      {
        key: "EPM-101",
        summary: "Write migration script",
        issueTypeId: "10002",
        issueTypeName: "Sub-task",
        isSubtask: true,
        parentKey: "EPM-100",
        parentSummary: "Setup database",
        status: "To Do",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/bulk/create/templates?project=EPM"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issues).toHaveLength(2);
    expect(body.issues[0].key).toBe("EPM-100");
    expect(body.issues[1].isSubtask).toBe(true);
    expect(body.issues[1].parentKey).toBe("EPM-100");
  });

  it("searches issues with query", async () => {
    mocks.searchTemplateIssues.mockResolvedValue([
      {
        key: "EPM-200",
        summary: "Login flow",
        issueTypeId: "10001",
        issueTypeName: "Story",
        isSubtask: false,
        status: "Done",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/bulk/create/templates?project=EPM&q=login"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(mocks.searchTemplateIssues).toHaveBeenCalledWith("EPM", "login", 15);
    expect(body.issues).toHaveLength(1);
    expect(body.issues[0].key).toBe("EPM-200");
  });

  it("returns full template data including parent details for a subtask", async () => {
    mocks.getIssue.mockImplementation((key: string) => {
      if (key === "EPM-105") {
        return Promise.resolve({
          key: "EPM-105",
          fields: {
            summary: "Implement JWT validation",
            description: "Validate Bearer token in auth middleware",
            project: { key: "EPM" },
            issuetype: { id: "10005", name: "Sub-task", subtask: true },
            assignee: { name: "bob", displayName: "Bob Developer" },
            priority: { id: "2", name: "High" },
            parent: {
              key: "EPM-100",
              fields: {
                summary: "Backend Authentication Feature",
                issuetype: { id: "10001", name: "Story" },
              },
            },
          },
        });
      }
      if (key === "EPM-100") {
        return Promise.resolve({
          key: "EPM-100",
          fields: {
            summary: "Backend Authentication Feature",
            description: "Complete feature for user auth",
            project: { key: "EPM" },
            issuetype: { id: "10001", name: "Story" },
            assignee: { name: "alice", displayName: "Alice Lead" },
            priority: { id: "1", name: "Highest" },
          },
        });
      }
      return Promise.reject(new Error("Not found"));
    });

    const res = await GET(
      new Request("http://localhost/api/bulk/create/templates?project=EPM&issueKey=EPM-105")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const template = body.template;
    expect(template).toBeDefined();
    expect(template.summary).toBe("Implement JWT validation");
    expect(template.sourceIsSubtask).toBe(true);
    expect(template.parentKey).toBe("EPM-100");
    expect(template.parentSummary).toBe("Backend Authentication Feature");
    expect(template.parentIssueTypeId).toBe("10001");
    // Verify parent is not marked as skipped!
    expect(template.skippedFields?.some((f: { field: string }) => f.field === "parent")).toBe(false);
    // Verify full parentTemplate is loaded
    expect(template.parentTemplate).toBeDefined();
    expect(template.parentTemplate.summary).toBe("Backend Authentication Feature");
    expect(template.parentTemplate.issueTypeId).toBe("10001");
    expect(template.parentTemplate.assignee).toBe("alice");
  });
});
