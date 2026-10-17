import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  issueCache: vi.fn(),
  hasOpenAiConfig: vi.fn(),
  userJiraAuth: vi.fn(),
  fetchMetadata: vi.fn(),
  generateJson: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { findMany: mocks.issueCache },
  },
}));
vi.mock("@/lib/env", () => ({ hasOpenAiConfig: mocks.hasOpenAiConfig }));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.logInfo, warn: mocks.logWarn, error: mocks.logError },
}));
vi.mock("@/lib/user-creds", () => ({ userJiraAuth: mocks.userJiraAuth }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({}),
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

const IDEA = "thêm nút xuất excel ở màn báo cáo";

const metadata = {
  project: { key: "ABC", name: "ABC" },
  issueTypes: [
    { id: "10001", name: "Task", subtask: false },
    { id: "10002", name: "Bug", subtask: false },
  ],
  priorityOptions: [{ id: "1", name: "High" }],
  components: [{ id: "c1", name: "Frontend" }],
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/ai/task-draft", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/ai/task-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.hasOpenAiConfig.mockReturnValue(true);
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    mocks.fetchMetadata.mockResolvedValue(metadata);
    mocks.issueCache.mockResolvedValue([{ labels: ["ui", "reporting"] }, { labels: ["ui", "ttw-bulk-x"] }]);
  });

  it("returns 401 without session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await post({ projectKey: "ABC", idea: IDEA })).status).toBe(401);
  });

  it("returns 503 when AI is not configured", async () => {
    mocks.hasOpenAiConfig.mockReturnValue(false);
    expect((await post({ projectKey: "ABC", idea: IDEA })).status).toBe(503);
  });

  it("validates idea and projectKey", async () => {
    expect((await post({ projectKey: "ABC", idea: "   " })).status).toBe(400);
    expect((await post({ projectKey: "ABC", idea: "x".repeat(4001) })).status).toBe(400);
    expect((await post({ idea: IDEA })).status).toBe(400);
    expect(mocks.generateJson).not.toHaveBeenCalled();
  });

  it("returns 428 without Jira credentials", async () => {
    mocks.userJiraAuth.mockReturnValue(null);
    expect((await post({ projectKey: "ABC", idea: IDEA })).status).toBe(428);
  });

  it("forwards Jira client errors from metadata", async () => {
    mocks.fetchMetadata.mockRejectedValue(new JiraRequestError("Không có quyền", 403, false));
    const res = await post({ projectKey: "ABC", idea: IDEA });
    expect(res.status).toBe(403);
  });

  it("returns the mapped prefill and warnings", async () => {
    mocks.generateJson.mockImplementation(async (prompt: string, parse: (o: unknown) => unknown) => {
      expect(prompt).toContain(IDEA);
      expect(prompt).toContain("Frontend");
      expect(prompt).toContain("reporting");
      expect(prompt).not.toContain("ttw-bulk-x");
      return parse({
        summary: "Thêm nút xuất Excel",
        description: "Bối cảnh",
        issueTypeName: "Task",
        priorityName: "High",
        componentNames: ["Frontend", "Foo"],
        labels: ["ui"],
      });
    });
    const res = await post({ projectKey: "abc", idea: IDEA, current: { summary: "Cũ" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefill).toEqual({
      summary: "Thêm nút xuất Excel",
      description: "Bối cảnh",
      issueTypeId: "10001",
      priorityId: "1",
      componentIds: ["c1"],
      labels: ["ui"],
    });
    expect(body.warnings.map((w: { code: string }) => w.code)).toEqual(["UNKNOWN_COMPONENT"]);
    expect(mocks.fetchMetadata).toHaveBeenCalledWith(expect.anything(), "ABC", expect.anything());
  });

  it("returns 502 with a Vietnamese message when AI is unavailable", async () => {
    mocks.generateJson.mockRejectedValue(new AiUnavailableError("AI unavailable: timeout"));
    const res = await post({ projectKey: "ABC", idea: IDEA });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("AI không phản hồi, thử lại");
  });

  it("never logs the idea text", async () => {
    mocks.generateJson.mockRejectedValue(new AiUnavailableError("AI unavailable: bad json"));
    await post({ projectKey: "ABC", idea: IDEA });
    mocks.generateJson.mockResolvedValue({ summary: "Sửa A" });
    await post({ projectKey: "ABC", idea: IDEA });
    const logged = JSON.stringify([
      ...mocks.logInfo.mock.calls,
      ...mocks.logWarn.mock.calls,
      ...mocks.logError.mock.calls,
    ]);
    expect(logged.length).toBeGreaterThan(2);
    expect(logged).not.toContain(IDEA);
  });
});
