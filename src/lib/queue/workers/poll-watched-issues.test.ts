import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  watches: vi.fn(), previous: vi.fn(), issue: vi.fn(), comments: vi.fn(),
  upsert: vi.fn(), syncComments: vi.fn(), notifyIssue: vi.fn(), notifyComment: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  watch: { findMany: mocks.watches }, issueCache: { findUnique: mocks.previous },
} }));
vi.mock("@/lib/jira/client", () => ({
  jira: { getIssue: mocks.issue, getComments: mocks.comments }, jiraIssueFields: () => "summary,updated", hasJiraCredentials: async () => true,
}));
vi.mock("@/lib/issues/cache", () => ({ upsertJiraIssue: mocks.upsert, upsertJiraCommentsWithNew: mocks.syncComments }));
vi.mock("@/lib/issues/notify-watchers", () => ({ notifyWatchersOfIssueChange: mocks.notifyIssue, notifyWatchersOfComment: mocks.notifyComment }));
import { runPollWatchedIssues } from "./poll-watched-issues";

describe("fast watch reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watches.mockResolvedValue([{ jiraKey: "APP-1" }]);
    mocks.previous.mockResolvedValue({ status: "To Do" });
    mocks.issue.mockResolvedValue({ key: "APP-1" });
    mocks.upsert.mockResolvedValue({ applied: true, data: { status: "Done" } });
    mocks.comments.mockResolvedValue([]);
    mocks.syncComments.mockResolvedValue({ newComments: [{ id: "c1", author: "alice", body: "Done" }] });
  });
  it("reads watched tasks directly and notifies metadata and comments in the same run", async () => {
    expect((await runPollWatchedIssues()).ok).toBe(true);
    expect(mocks.watches).toHaveBeenCalledWith({ select: { jiraKey: true }, distinct: ["jiraKey"] });
    expect(mocks.notifyIssue).toHaveBeenCalledWith({ status: "To Do" }, { jiraKey: "APP-1", status: "Done" });
    expect(mocks.notifyComment).toHaveBeenCalledWith("APP-1", "alice", "Done", "c1");
  });
  it("continues other watches when one Jira request fails", async () => {
    mocks.watches.mockResolvedValue([{ jiraKey: "APP-1" }, { jiraKey: "APP-2" }]);
    mocks.issue.mockRejectedValueOnce(new Error("unavailable"));
    const result = await runPollWatchedIssues();
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["APP-1: unavailable"]);
    expect(mocks.notifyComment).toHaveBeenCalledWith("APP-2", "alice", "Done", "c1");
  });
});
