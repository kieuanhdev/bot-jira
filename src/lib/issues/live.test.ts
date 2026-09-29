import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cached: vi.fn(), issue: vi.fn(), comments: vi.fn(), upsert: vi.fn(), cacheComments: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { issueCache: { findUnique: mocks.cached } } }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({ getIssue: mocks.issue, getComments: mocks.comments }),
  jiraIssueFields: () => "status,updated",
  jiraPointsFromFields: () => ({ points: null, fieldId: null }),
  parseJiraDate: (value?: string) => value ? new Date(value) : null,
}));
vi.mock("@/lib/issues/cache", () => ({ upsertJiraIssue: mocks.upsert, upsertJiraComments: mocks.cacheComments }));
vi.mock("@/lib/issues/notify-watchers", () => ({ notifyWatchersOfIssueChange: mocks.notify }));
import { getIssueView } from "./live";

describe("live task reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cached.mockResolvedValue({ jiraKey: "APP-1", status: "To Do" });
    mocks.issue.mockResolvedValue({ key: "APP-1", fields: { status: { name: "Done" } } });
    mocks.comments.mockResolvedValue([]);
    mocks.upsert.mockResolvedValue({ status: "Done" });
    mocks.cacheComments.mockResolvedValue(0);
    mocks.notify.mockResolvedValue(1);
  });
  it("notifies a transition seen by the detail page before the worker reads it", async () => {
    const result = await getIssueView("APP-1", { user: "test", token: "test", authMode: "Bearer" });
    expect(result?.status).toBe("Done");
    expect(mocks.notify).toHaveBeenCalledWith(
      { jiraKey: "APP-1", status: "To Do" }, { jiraKey: "APP-1", status: "Done" },
    );
  });
  it("still returns the live task when notification delivery fails", async () => {
    mocks.notify.mockRejectedValue(new Error("delivery unavailable"));
    expect((await getIssueView("APP-1", { user: "test", token: "test", authMode: "Bearer" }))?.status).toBe("Done");
  });
});
