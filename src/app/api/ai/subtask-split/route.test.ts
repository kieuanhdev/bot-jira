import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  hasOpenAiConfig: vi.fn(),
  userJiraAuth: vi.fn(),
  fetchMetadata: vi.fn(),
  getIssue: vi.fn(),
  generateJson: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.user } } }));
vi.mock("@/lib/env", () => ({ hasOpenAiConfig: mocks.hasOpenAiConfig }));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.logInfo, warn: mocks.logWarn, error: mocks.logError },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userJiraAuth }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ getIssue: mocks.getIssue }),
  JiraRequestError: class extends Error {
    constructor(msg: string, public status: number | null = 400, public retryable = false) {
      super(msg);
    }
  },
}));
vi.mock("@/lib/bulk/create-metadata", () => ({ fetchBulkCreateMetadata: mocks.fetchMetadata }));
vi.mock("@/lib/ai/generate-json", () => ({ generateJson: mocks.generateJson }));

import { AiUnavailableError } from "@/lib/ai/errors";
import { JiraRequestError } from "@/lib/jira/client";
import { POST } from "./route";

const PARENT_SUMMARY = "Xuất báo cáo doanh thu ra Excel";
const PARENT_DESCRIPTION = "Người dùng cần tải báo cáo tháng";

const metadata = {
  project: { key: "ABC", name: "ABC" },
  canCreate: true,
  issueTypes: [
    { id: "10001", name: "Task", subtask: false },
    { id: "10002", name: "Epic", subtask: false },
    { id: "10003", name: "Sub-task", subtask: true },
  ],
  priorityOptions: [],
  components: [{ id: "c1", name: "Frontend" }],
  hasSubtaskTypes: true,
  defaultSubtaskTypeId: "10003",
  defaultIssueTypeId: "10001",
};

function parentIssue(type: { id: string; name: string; subtask: boolean }, projectKey = "ABC") {
  return {
    id: "1",
    key: "ABC-1",
    self: "",
    fields: {
      summary: PARENT_SUMMARY,
      description: PARENT_DESCRIPTION,
      issuetype: type,
      project: { key: projectKey },
    },
  };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/ai/subtask-split", { method: "POST", body: JSON.stringify(body) })
  );
}

describe("POST /api/ai/subtask-split", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.hasOpenAiConfig.mockReturnValue(true);
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    mocks.fetchMetadata.mockResolvedValue(metadata);
    mocks.getIssue.mockResolvedValue(parentIssue({ id: "10001", name: "Task", subtask: false }));
  });

  it("guards session, AI config, input and Jira credentials", async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await post({ projectKey: "ABC", parentKey: "ABC-1" })).status).toBe(401);
    mocks.hasOpenAiConfig.mockReturnValueOnce(false);
    expect((await post({ projectKey: "ABC", parentKey: "ABC-1" })).status).toBe(503);
    expect((await post({ parentKey: "ABC-1" })).status).toBe(400);
    expect((await post({ projectKey: "ABC", parentKey: "not a key" })).status).toBe(400);
    mocks.userJiraAuth.mockReturnValueOnce(null);
    expect((await post({ projectKey: "ABC", parentKey: "ABC-1" })).status).toBe(428);
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("maps a missing parent to 404", async () => {
    mocks.getIssue.mockRejectedValue(new JiraRequestError("Not found", 404, false));
    const res = await post({ projectKey: "ABC", parentKey: "ABC-9" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("ABC-9");
  });

  it("rejects a parent from another project and a sub-task parent", async () => {
    mocks.getIssue.mockResolvedValueOnce(parentIssue({ id: "10001", name: "Task", subtask: false }, "XYZ"));
    expect((await post({ projectKey: "ABC", parentKey: "ABC-1" })).status).toBe(400);
    mocks.getIssue.mockResolvedValueOnce(parentIssue({ id: "10003", name: "Sub-task", subtask: true }));
    const res = await post({ projectKey: "ABC", parentKey: "ABC-1" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("PARENT_IS_SUBTASK");
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("returns sub-task rows linked to the parent, built from the Jira issue", async () => {
    mocks.generateJson.mockImplementation(async (prompt: string, parse: (o: unknown) => unknown) => {
      expect(prompt).toContain(PARENT_SUMMARY);
      expect(prompt).toContain(PARENT_DESCRIPTION);
      return parse({ items: [{ summary: "Làm UI", componentNames: ["Frontend"] }, { summary: "Làm API" }] });
    });
    const res = await post({ projectKey: "abc", parentKey: "abc-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([
      {
        clientRef: "row-1",
        summary: "Làm UI",
        issueTypeId: "10003",
        parent: { type: "jira", jiraKey: "ABC-1" },
        componentIds: ["c1"],
      },
      { clientRef: "row-2", summary: "Làm API", issueTypeId: "10003", parent: { type: "jira", jiraKey: "ABC-1" } },
    ]);
  });

  it("uses a standard issue type under an epic", async () => {
    mocks.getIssue.mockResolvedValue(parentIssue({ id: "10002", name: "Epic", subtask: false }));
    mocks.generateJson.mockImplementation(async (_p: string, parse: (o: unknown) => unknown) =>
      parse({ items: [{ summary: "Làm UI" }] })
    );
    const body = await (await post({ projectKey: "ABC", parentKey: "ABC-1" })).json();
    expect(body.items[0].issueTypeId).toBe("10001");
    expect(body.items[0].parent).toEqual({ type: "jira", jiraKey: "ABC-1" });
  });

  it("returns 502 when AI is unavailable and never logs the task text", async () => {
    mocks.generateJson.mockRejectedValueOnce(new AiUnavailableError("AI unavailable: timeout"));
    const res = await post({ projectKey: "ABC", parentKey: "ABC-1" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("AI không phản hồi, thử lại");

    mocks.generateJson.mockResolvedValueOnce([{ summary: "Làm UI" }]);
    expect((await post({ projectKey: "ABC", parentKey: "ABC-1" })).status).toBe(200);
    const logged = JSON.stringify([
      ...mocks.logInfo.mock.calls,
      ...mocks.logWarn.mock.calls,
      ...mocks.logError.mock.calls,
    ]);
    expect(logged.length).toBeGreaterThan(2);
    expect(logged).not.toContain(PARENT_SUMMARY);
    expect(logged).not.toContain(PARENT_DESCRIPTION);
  });
});
